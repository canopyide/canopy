import { commandService } from "../CommandService.js";
import { githubCreateIssueCommand } from "./githubCreateIssue.js";
import { githubWorkIssueCommand } from "./githubWorkIssue.js";

export function registerCommands(): void {
  commandService.register(githubCreateIssueCommand);
  commandService.register(githubWorkIssueCommand);
}
