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

    //await stack.destroy();
    //await stack.up();

    return stack;
}

export async function getOutputs(stack: Stack) {
    const outputs = await stack.outputs();
    return outputs;
}

/**
 * Replace a specific resource in the stack
 */
export async function replaceResource(stack: Stack, resourceUrn: string) {
    console.log(`Replacing resource: ${resourceUrn}`);
    
    const upResult = await stack.up({
        replace: [resourceUrn],
        onOutput: (msg) => console.log(msg)
    });
    
    console.log(`Replace completed. Summary: ${upResult.summary.kind}`);
    return upResult;
}

/**
 * Get all resource URNs from the stack
 */
export async function getResourceUrns(_stack: Stack): Promise<string[]> {
    throw("Not implemented yet");
}

/**
 * Find resource URN by type and name pattern
 */
export async function findResourceUrn(_stack: Stack, resourceType: string, namePattern?: string): Promise<string | undefined> {
    const urns = await getResourceUrns(_stack);
    
    return urns.find(urn => {
        const matchesType = urn.includes(`::${resourceType}::`);
        const matchesName = !namePattern || urn.includes(namePattern);
        return matchesType && matchesName;
    });
}

/**
 * Replace OpenSearch collection specifically
 */
export async function replaceOpenSearchCollection(stack: Stack) {
    const collectionUrn = await findResourceUrn(
        stack, 
        "aws:opensearch/serverlessCollection:ServerlessCollection"
    );
    
    if (!collectionUrn) {
        throw new Error("OpenSearch collection not found in stack");
    }
    
    console.log(`Found OpenSearch collection: ${collectionUrn}`);
    return await replaceResource(stack, collectionUrn);
}