import { LocalWorkspace } from "@pulumi/pulumi/automation/index.js";
import * as path from "path";
import { fileURLToPath } from "url";

const stackName = "staging";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workDir = path.join(__dirname, "../..");

export async function select() {
    // Create or select a stack
    const stack = await LocalWorkspace.selectStack({
        stackName,
        workDir,
    });

    //console.log("Installing plugins...");
    // await stack.workspace.installPlugin("aws", "v6.0.0");
    // await stack.workspace.installPlugin("pinecone-database/pulumi", "v0.4.3");


    return stack;

    // console.log("Deploying infrastructure...");
    // const upResult = await stack.up({ onOutput: console.log });
    // console.log(`Stack update completed. Status: ${upResult.summary.kind}`);

    // return upResult.outputs;
}

export async function destroy(): Promise<void> {
    // const stack = await LocalWorkspace.selectStack({
    //     stackName,
    //     workDir,
    // });

    // console.log("Destroying infrastructure...");
    // await stack.destroy({ onOutput: console.log });
    // console.log("Infrastructure destroyed.");
}

export async function getOutputs(): Promise<{ [key: string]: any }> {
    const stack = await LocalWorkspace.selectStack({
        stackName,
        workDir,
    });

    const outputs = await stack.outputs();
    return outputs;
}

export async function refresh(): Promise<void> {
    const stack = await LocalWorkspace.selectStack({
        stackName,
        workDir,
    });

    console.log("Refreshing stack state...");
    await stack.refresh({ onOutput: console.log });
    console.log("Stack refresh completed.");
}