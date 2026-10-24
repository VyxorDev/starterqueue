import { spawn } from "node:child_process";
import readline from "node:readline";
import { auditIssues } from "./audit.js";
import { fetchStarterIssues, parseRepo, type RepoRef } from "./github.js";
import { summarizeAudit } from "./output.js";
import {
  nextIssueFilter,
  emptyResultsMessage,
  safeGitHubIssueUrl,
  sanitizeTerminalText,
  truncateText,
  visibleResults,
  visibleWindow,
  type IssueFilter,
} from "./tui-model.js";
import type { AuditedIssue } from "./types.js";

type Screen = "welcome" | "auditing" | "results" | "detail" | "help" | "error";
interface Keypress {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
}

const ESC = "\u001b[";
const PALETTE = {
  silver: [232, 233, 236],
  muted: [143, 153, 166],
  frost: [185, 201, 226],
  green: [125, 199, 165],
  amber: [229, 189, 123],
  coral: [231, 143, 151],
} as const;

type Tone = keyof typeof PALETTE;

class TerminalApp {
  private screen: Screen = "welcome";
  private previousScreen: Screen = "welcome";
  private repoInput = "";
  private inputFocused = true;
  private menuIndex = 0;
  private notice = "";
  private repository = "";
  private results: AuditedIssue[] = [];
  private filter: IssueFilter = "all";
  private search = "";
  private searchFocused = false;
  private selected = 0;
  private progress = "";
  private errorMessage = "";
  private spinnerIndex = 0;
  private spinner: ReturnType<typeof setInterval> | undefined;
  private auditController: AbortController | undefined;
  private finished = false;
  private originalRaw = false;
  private resolveDone: (() => void) | undefined;

  constructor(
    private readonly input: NodeJS.ReadStream,
    private readonly output: NodeJS.WriteStream,
  ) {}

  run(): Promise<void> {
    this.originalRaw = Boolean(this.input.isRaw);
    readline.emitKeypressEvents(this.input);
    this.input.setRawMode(true);
    this.input.resume();
    this.input.on("keypress", this.onKeypress);
    this.output.on("resize", this.onResize);
    process.on("SIGINT", this.onSignal);
    process.on("SIGTERM", this.onSignal);
    this.output.write(ESC + "?1049h" + ESC + "?25l");
    this.render();
    return new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  private readonly onResize = (): void => this.render();
  private readonly onSignal = (): void => this.close();
  private readonly onKeypress = (text: string, key: Keypress = {}): void => {
    if (this.finished) return;
    if ((key.ctrl && key.name === "c") || (key.ctrl && key.name === "d")) {
      this.close();
      return;
    }
    if (this.screen === "auditing") return;
    if (this.screen === "welcome") this.welcomeKey(text, key);
    else if (this.screen === "results") this.resultsKey(text, key);
    else if (this.screen === "detail") this.detailKey(key);
    else if (this.screen === "help") {
      if (key.name === "escape" || key.name === "return" || key.name === "backspace") {
        this.screen = this.previousScreen;
      }
    } else if (this.screen === "error") {
      if (key.name === "escape" || key.name === "return") {
        this.screen = "welcome";
        this.inputFocused = true;
      }
    }
    this.render();
  };

  private close(): void {
    if (this.finished) return;
    this.finished = true;
    this.stopSpinner();
    this.auditController?.abort();
    this.input.off("keypress", this.onKeypress);
    this.output.off("resize", this.onResize);
    process.off("SIGINT", this.onSignal);
    process.off("SIGTERM", this.onSignal);
    this.input.setRawMode(this.originalRaw);
    this.input.pause();
    this.output.write(ESC + "?25h" + ESC + "?1049l");
    this.resolveDone?.();
  }

  private welcomeKey(text: string, key: Keypress): void {
    if (key.name === "up") {
      if (this.inputFocused) {
        this.inputFocused = false;
        this.menuIndex = 2;
      } else {
        this.menuIndex = (this.menuIndex + 2) % 3;
      }
    } else if (key.name === "down") {
      if (this.inputFocused) {
        this.inputFocused = false;
        this.menuIndex = 0;
      } else {
        this.menuIndex = (this.menuIndex + 1) % 3;
      }
    } else if (key.name === "tab") {
      this.inputFocused = !this.inputFocused;
      this.menuIndex = 0;
    } else if (key.name === "escape") {
      this.inputFocused = true;
      this.notice = "";
    } else if (key.name === "backspace" && this.inputFocused) {
      this.repoInput = Array.from(this.repoInput).slice(0, -1).join("");
      this.notice = "";
    } else if (key.name === "return") {
      if (this.inputFocused || this.menuIndex === 0) {
        this.startAudit();
      } else if (this.menuIndex === 1) {
        this.openHelp();
      } else {
        this.close();
      }
    } else if (this.printable(text, key)) {
      this.inputFocused = true;
      this.repoInput += text;
      this.notice = "";
    }
  }

  private resultsKey(text: string, key: Keypress): void {
    if (this.searchFocused) {
      if (key.name === "escape" || key.name === "return") {
        this.searchFocused = false;
      } else if (key.name === "backspace") {
        this.search = Array.from(this.search).slice(0, -1).join("");
        this.selected = 0;
      } else if (this.printable(text, key)) {
        this.search += text;
        this.selected = 0;
      }
      return;
    }

    const items = visibleResults(this.results, this.filter, this.search);
    if (key.name === "up") this.selected = Math.max(0, this.selected - 1);
    else if (key.name === "down") this.selected = Math.min(items.length - 1, this.selected + 1);
    else if (key.name === "pageup") this.selected = Math.max(0, this.selected - 8);
    else if (key.name === "pagedown") this.selected = Math.min(items.length - 1, this.selected + 8);
    else if (key.name === "return" && items[this.selected]) this.screen = "detail";
    else if (key.name === "escape" || text === "r") {
      this.screen = "welcome";
      this.inputFocused = true;
      this.notice = "";
    } else if (text === "f") {
      this.filter = nextIssueFilter(this.filter);
      this.selected = 0;
    } else if (text === "/") {
      this.searchFocused = true;
    } else if (text === "x") {
      this.search = "";
      this.selected = 0;
    } else if (text === "?") {
      this.openHelp();
    } else if (text === "o" && items[this.selected]) {
      this.openIssue(items[this.selected]);
    }
    this.selected = Math.max(0, this.selected);
  }

  private detailKey(key: Keypress): void {
    const items = visibleResults(this.results, this.filter, this.search);
    if (key.name === "escape" || key.name === "backspace") {
      this.screen = "results";
    } else if (key.name === "o" && items[this.selected]) {
      this.openIssue(items[this.selected]);
    } else if (key.name === "return") {
      this.screen = "results";
    }
  }

  private printable(text: string, key: Keypress): boolean {
    return Boolean(text && !key.ctrl && !key.meta && !/[\u0000-\u001f\u007f]/.test(text));
  }

  private openHelp(): void {
    this.previousScreen = this.screen;
    this.screen = "help";
  }

  private startAudit(): void {
    let repo: RepoRef;
    try {
      repo = parseRepo(this.repoInput);
    } catch (error) {
      this.notice = error instanceof Error ? error.message : String(error);
      this.inputFocused = true;
      return;
    }
    this.repository = repo.owner + "/" + repo.name;
    this.auditController = new AbortController();
    this.progress = "Fetching issues and closing PR links";
    this.screen = "auditing";
    this.spinnerIndex = 0;
    this.spinner = setInterval(() => {
      this.spinnerIndex = (this.spinnerIndex + 1) % 4;
      this.render();
    }, 220);
    void this.performAudit(repo);
  }

  private async performAudit(repo: RepoRef): Promise<void> {
    const controller = this.auditController;
    try {
      const issues = await fetchStarterIssues(repo, { token: process.env.GH_TOKEN, signal: controller?.signal });
      if (this.finished) return;
      this.progress = "Evaluating readiness rules";
      this.render();
      this.results = auditIssues(issues);
      this.filter = "all";
      this.search = "";
      this.searchFocused = false;
      this.selected = 0;
      this.notice = process.env.GH_TOKEN ? "" : "GH_TOKEN not set: SQ004 closing-PR detection was skipped.";
      this.screen = "results";
    } catch (error) {
      if (this.finished) return;
      this.errorMessage = error instanceof Error ? error.message : String(error);
      this.screen = "error";
    } finally {
      this.stopSpinner();
      if (this.auditController === controller) this.auditController = undefined;
      if (!this.finished) this.render();
    }
  }

  private stopSpinner(): void {
    if (this.spinner) clearInterval(this.spinner);
    this.spinner = undefined;
  }

  private openIssue(result: AuditedIssue): void {
    const url = safeGitHubIssueUrl(result.issue.html_url);
    if (!url) {
      this.notice = "Cannot open an unrecognized GitHub issue URL.";
      return;
    }
    const command = process.platform === "win32"
      ? "explorer.exe"
      : process.platform === "darwin" ? "open" : "xdg-open";
    try {
      const child = spawn(command, [url], { detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", () => {
        this.notice = "Could not launch the browser. Open the URL shown in issue details.";
        if (!this.finished) this.render();
      });
      child.unref();
      this.notice = "Requested to open the issue in your browser.";
    } catch {
      this.notice = "Could not launch the browser. Open the URL shown in issue details.";
    }
  }

  private color(value: string, tone: Tone, bold = false): string {
    if (process.env.NO_COLOR !== undefined) return value;
    const depth = this.output.getColorDepth();
    if (depth < 4) return value;
    const rgb = PALETTE[tone];
    const foreground = depth >= 24
      ? ESC + "38;2;" + rgb.join(";") + "m"
      : depth >= 8
        ? ESC + "38;5;" + ({ silver: 255, muted: 246, frost: 153, green: 115, amber: 222, coral: 210 }[tone]) + "m"
        : ESC + ({ silver: "37", muted: "90", frost: "36", green: "32", amber: "33", coral: "31" }[tone]) + "m";
    return (bold ? ESC + "1m" : "") + foreground + value + ESC + "0m";
  }

  private statusTone(status: AuditedIssue["status"]): Tone {
    return status === "fail" ? "coral" : status === "warn" ? "amber" : "green";
  }

  private render(): void {
    if (this.finished) return;
    const width = this.output.columns || 80;
    const height = this.output.rows || 24;
    const lines: string[] = [];
    const contentWidth = Math.max(18, Math.min(width - 8, 88));
    const indent = " ".repeat(Math.max(2, Math.floor((width - contentWidth) / 2)));
    const add = (value = ""): void => { lines.push(indent + value); };
    const label = (value: string): string => this.color(value, "muted");
    const title = (value: string): string => this.color(value, "silver", true);
    const accent = (value: string): string => this.color(value, "frost", true);
    const separator = "─".repeat(contentWidth);
    let footer = "Ctrl+C  Exit";

    if (width < 54 || height < 16) {
      add("");
      add(title("starterqueue"));
      add("");
      add("Resize your terminal to at least 54 × 16.");
    } else {
      add("");
      add(accent("◆") + " " + title("starterqueue"));
      add(label(separator));
      add("");

      if (this.screen === "welcome") {
        add("");
        add(title("Welcome."));
        add(label("A clearer view of your contribution queue."));
        add("");
        add("");
        add(label("REPOSITORY"));
        const entered = truncateText(this.repoInput, contentWidth - 7);
        add((this.inputFocused ? accent("› ") : label("  ")) + (entered ? title(entered) : label("owner/repository")) + (this.inputFocused ? accent("▍") : ""));
        add(label("Paste a GitHub URL or type owner/repo."));
        add("");
        add("");
        const actions = ["Start audit", "Help & shortcuts", "Exit"];
        actions.forEach((action, index) => {
          const selected = !this.inputFocused && this.menuIndex === index;
          add((selected ? accent("› ") : "  ") + (selected ? title(action) : label(action)));
        });
        if (this.notice) {
          add("");
          add(this.color(truncateText(this.notice, contentWidth), "coral"));
        }
        footer = "Type repository  ·  ↑↓ Menu  ·  Tab Focus  ·  Enter Select";
      } else if (this.screen === "auditing") {
        add("");
        add(title("Auditing " + truncateText(this.repository, contentWidth - 9)));
        add("");
        add(accent(["◐", "◓", "◑", "◒"][this.spinnerIndex]) + "  " + label(this.progress));
        add("");
        add(label("This may take a moment for larger repositories."));
        if (!process.env.GH_TOKEN) {
          add("");
          add(this.color("GH_TOKEN not set — SQ004 closing-PR checks will be skipped.", "amber"));
        }
        footer = "Ctrl+C  Exit";
      } else if (this.screen === "results") {
        const summary = summarizeAudit(this.results);
        const items = visibleResults(this.results, this.filter, this.search);
        add(title(truncateText(this.repository, contentWidth)));
        add(label("Audit complete  ·  " + summary.total + " issues"));
        add("");
        add(this.color("PASS " + summary.pass, "green", true) + "    " +
          this.color("WARN " + summary.warn, "amber", true) + "    " +
          this.color("FAIL " + summary.fail, "coral", true));
        add("");
        add(label("FILTER  ") + accent(this.filter.toUpperCase()) + label("  ·  Press F to cycle"));
        add(label("SEARCH  ") + (this.search ? title(truncateText(this.search, contentWidth - 14)) : label("All issues")) +
          (this.searchFocused ? accent("▍") : ""));
        add(label(separator));
        const rows = Math.max(2, height - 15);
        const window = visibleWindow(this.selected, items.length, rows);
        if (items.length === 0) {
          const empty = emptyResultsMessage(summary.total, this.filter, this.search);
          add("");
          add(accent(empty.title));
          add("");
          add(label(truncateText(empty.hint, contentWidth)));
        }
        for (let index = window.start; index < window.end; index += 1) {
          const item = items[index];
          const selected = index === this.selected;
          const status = item.status.toUpperCase().padEnd(4);
          const heading = "#" + item.issue.number + "  " + sanitizeTerminalText(item.issue.title);
          const maxTitle = Math.max(8, contentWidth - 13);
          add((selected ? accent("› ") : "  ") +
            this.color(status, this.statusTone(item.status), selected) +
            "  " + (selected ? title(truncateText(heading, maxTitle)) : label(truncateText(heading, maxTitle))));
        }
        add("");
        add(label("Showing " + items.length + " of " + summary.total + " issues"));
        if (this.notice) add(this.color(truncateText(this.notice, contentWidth), "frost"));
        footer = this.searchFocused
          ? "Type to search  ·  Enter Done  ·  Esc Done"
          : "↑↓ Browse  ·  Enter Details  ·  F Filter  ·  / Search  ·  O Open  ·  R New";
      } else if (this.screen === "detail") {
        const item = visibleResults(this.results, this.filter, this.search)[this.selected];
        if (!item) {
          this.screen = "results";
          this.render();
          return;
        }
        add(this.color(item.status.toUpperCase(), this.statusTone(item.status), true) +
          "   " + title("#" + item.issue.number));
        add("");
        add(title(truncateText(sanitizeTerminalText(item.issue.title), contentWidth)));
        add("");
        add(label("FINDINGS"));
        if (item.findings.length === 0) {
          add(this.color("No readiness problems detected.", "green"));
        } else {
          for (const finding of item.findings.slice(0, Math.max(1, height - 15))) {
            add(this.color(finding.code + " " + finding.level.toUpperCase(), finding.level === "fail" ? "coral" : "amber"));
            add(label(truncateText(finding.message, contentWidth - 2)));
            add("");
          }
        }
        add(label("ISSUE URL"));
        add(accent(truncateText(item.issue.html_url, contentWidth)));
        if (this.notice) {
          add("");
          add(label(truncateText(this.notice, contentWidth)));
        }
        footer = "Esc Back  ·  O Open in browser";
      } else if (this.screen === "help") {
        add(title("Keyboard shortcuts"));
        add("");
        const shortcuts = [
          ["Enter", "Select or view details"],
          ["↑ / ↓", "Navigate menus and issues"],
          ["Tab", "Switch welcome-screen focus"],
          ["F", "Cycle results filter"],
          ["/", "Search issue titles, numbers, findings"],
          ["X", "Clear results search"],
          ["O", "Open selected issue in browser"],
          ["R", "Start another audit"],
          ["Esc", "Back / finish search"],
          ["Ctrl+C", "Exit StarterQueue"],
        ];
        for (const [key, description] of shortcuts) {
          add(accent(key.padEnd(10)) + label(description));
        }
        footer = "Esc  Back";
      } else if (this.screen === "error") {
        add(this.color("Audit could not complete.", "coral", true));
        add("");
        add(label(truncateText(this.errorMessage, contentWidth)));
        add("");
        add(label("Check the repository name, network access and GH_TOKEN."));
        footer = "Enter / Esc  Back to welcome";
      }
    }

    while (lines.length < height - 3) lines.push("");
    add(label(separator.slice(0, Math.max(0, contentWidth))));
    add(label(truncateText(footer, contentWidth)));
    const rendered = lines.slice(0, Math.max(1, height - 1)).join("\n");
    this.output.write(ESC + "H" + ESC + "2J" + rendered + ESC + "0m");
  }
}

export async function runTui(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Interactive mode requires a terminal. Use starterqueue audit owner/repo for scripts and CI.");
  }
  await new TerminalApp(process.stdin, process.stdout).run();
}
