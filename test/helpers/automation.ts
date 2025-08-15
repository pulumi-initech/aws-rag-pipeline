import { LocalWorkspace } from "@pulumi/pulumi/automation/index.js";
import * as path from "path";
import { fileURLToPath } from "url";

const stackName = "staging";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(__dirname, "../..");

export async function select() {
    // Select existing stack
    const stack = await LocalWorkspace.createOrSelectStack({
        stackName,
        workDir,
    });

    //await stack.destroy();
    //await stack.up();

    return stack;
}