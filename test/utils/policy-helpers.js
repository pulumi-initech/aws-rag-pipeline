const { expect } = require('chai');

/**
 * Helper function to extract policy statements from a policy document
 * @param {string|object} policy - The policy document (JSON string or object)
 * @returns {Array} Array of policy statements
 */
function extractPolicyStatements(policy) {
    const policyDoc = typeof policy === 'string' ? JSON.parse(policy) : policy;
    return policyDoc.Statement || [];
}

/**
 * Check if a policy contains a specific action
 * @param {string|object} policy - The policy document
 * @param {string} action - The action to check for
 * @returns {boolean} True if action is found
 */
function policyContainsAction(policy, action) {
    const statements = extractPolicyStatements(policy);
    return statements.some(statement => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes(action);
    });
}

/**
 * Check if a policy contains any OpenSearch actions
 * @param {string|object} policy - The policy document
 * @returns {boolean} True if any aoss: actions are found
 */
function policyContainsOpenSearchActions(policy) {
    const statements = extractPolicyStatements(policy);
    return statements.some(statement => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.some(action => action.startsWith('aoss:'));
    });
}

/**
 * Get all OpenSearch actions from a policy
 * @param {string|object} policy - The policy document
 * @returns {Array} Array of OpenSearch actions
 */
function getOpenSearchActions(policy) {
    const statements = extractPolicyStatements(policy);
    const allActions = [];
    
    statements.forEach(statement => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        actions.forEach(action => {
            if (action.startsWith('aoss:')) {
                allActions.push(action);
            }
        });
    });
    
    return allActions;
}

/**
 * Validate that a policy has the required base permissions
 * @param {string|object} policy - The policy document
 */
function validateBasePolicyPermissions(policy) {
    const statements = extractPolicyStatements(policy);
    
    // Check for logging permissions
    const hasLoggingPermissions = statements.some(statement => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('logs:CreateLogGroup') &&
               actions.includes('logs:CreateLogStream') &&
               actions.includes('logs:PutLogEvents');
    });
    
    // Check for Bedrock permissions
    const hasBedrockPermissions = statements.some(statement => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('bedrock:InvokeModel');
    });
    
    expect(hasLoggingPermissions, 'Policy should have logging permissions').to.be.true;
    expect(hasBedrockPermissions, 'Policy should have Bedrock permissions').to.be.true;
}

/**
 * Validate that a policy has S3 permissions (for ingestion)
 * @param {string|object} policy - The policy document
 */
function validateS3PolicyPermissions(policy) {
    const statements = extractPolicyStatements(policy);
    
    const hasS3Permissions = statements.some(statement => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('s3:GetObject');
    });
    
    const hasKMSPermissions = statements.some(statement => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('kms:Decrypt') && actions.includes('kms:DescribeKey');
    });
    
    expect(hasS3Permissions, 'Policy should have S3 GetObject permissions').to.be.true;
    expect(hasKMSPermissions, 'Policy should have KMS permissions').to.be.true;
}

module.exports = {
    extractPolicyStatements,
    policyContainsAction,
    policyContainsOpenSearchActions,
    getOpenSearchActions,
    validateBasePolicyPermissions,
    validateS3PolicyPermissions
};