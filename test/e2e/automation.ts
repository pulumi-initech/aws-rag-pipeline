import { LocalWorkspace, Stack } from "@pulumi/pulumi/automation/index.js";
import * as path from "path";
import { fileURLToPath } from "url";

const stackName = "staging";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(__dirname, "../..");

export async function select() {
    // Select existing stack
    const stack = await LocalWorkspace.selectStack({
        stackName,
        workDir,
    });


    return stack;
}

export async function getOutputs(stack: Stack) {
    const outputs = await stack.outputs();
    return outputs;
}