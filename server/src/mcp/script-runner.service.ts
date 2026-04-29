import { Injectable } from "@nestjs/common";
import * as vm from "vm";

export interface ScriptResult {
  result: unknown;
  error?: string;
}

@Injectable()
export class ScriptRunnerService {
  private readonly TIMEOUT_MS = 1000;

  /**
   * Run a JS expression inside a Node.js VM sandbox.
   * `context` variables are injected as globals so a script like
   * `teamSize * velocity * 800` works directly.
   *
   * `require`, `process`, `global`, etc. are NOT available — safe for demo calcs.
   */
  execute(script: string, context: Record<string, unknown>): ScriptResult {
    // Skip empty scripts — agent sometimes sends an empty first call
    if (!script.trim()) {
      return { result: null, error: "Empty script" };
    }

    const sandbox: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(context)) {
      const n = Number(v);
      sandbox[k] = Number.isNaN(n) ? v : n;
    }
    sandbox.Math = Math;

    try {
      const wrapped = `(function(){ return (${script.trim()}); })()`;
      const result = vm.runInNewContext(wrapped, sandbox, {
        timeout: this.TIMEOUT_MS,
        filename: "run_script.vm",
      });
      return { result };
    } catch (err) {
      return { result: null, error: String(err) };
    }
  }
}
