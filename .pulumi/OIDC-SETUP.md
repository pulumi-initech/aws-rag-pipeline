# Pulumi ESC OIDC Setup Guide

This guide explains how to set up OIDC authentication between GitHub Actions and Pulumi ESC for secure, token-less deployments.

## 🔒 Security Benefits

- **No Long-lived Secrets**: Eliminates need to store `PULUMI_ACCESS_TOKEN` in GitHub Secrets
- **Short-lived Credentials**: AWS credentials are temporary (1-2 hours)
- **Identity-based Access**: Uses GitHub's identity to authenticate with Pulumi
- **Audit Trail**: Complete audit trail of who deployed what and when

## 📋 Prerequisites

1. **AWS Account**: With appropriate permissions to create IAM roles
2. **Pulumi Cloud Account**: Organization with ESC enabled
3. **GitHub Repository**: With Actions enabled

## 🚀 Setup Steps

### Step 1: Create AWS IAM Roles

Create separate IAM roles for each environment:

```bash
# Create role for PR environments
aws iam create-role \
  --role-name pulumi-esc-pr-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Federated": "arn:aws:iam::123456789012:oidc-provider/login.pulumi.com"
        },
        "Action": "sts:AssumeRoleWithWebIdentity"
      }
    ]
  }'

# Attach necessary policies
aws iam attach-role-policy \
  --role-name pulumi-esc-pr-role \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess
```

Repeat for staging and production roles with appropriate policies.

### Step 2: Register GitHub OIDC Issuer in Pulumi Cloud

1. Go to **Pulumi Cloud** → **Settings** → **OIDC Integration**
2. Add new issuer:
   - **Issuer URL**: `https://token.actions.githubusercontent.com`
   - **Audience**: `urn:pulumi:audiences:organization:<your-org>`
3. Configure subject rules:
   - **Subject Pattern**: `repo:<github-org>/<repo-name>:*`
   - **Decision**: Allow

### Step 3: Create Pulumi ESC Environments

Create environments for each deployment stage:

```bash
# Create PR environment
pulumi env init <your-org>/aws-rag-pipeline-pr

# Create staging environment  
pulumi env init <your-org>/aws-rag-pipeline-staging

# Create production environment
pulumi env init <your-org>/aws-rag-pipeline-production
```

### Step 4: Configure Environment Files

Copy the configuration from the example files in `.pulumi/esc-environments/` to your Pulumi Cloud environments:

1. **PR Environment**: Use `aws-rag-pipeline-pr.yaml`
2. **Staging Environment**: Use `aws-rag-pipeline-staging.yaml`  
3. **Production Environment**: Use `aws-rag-pipeline-production.yaml`

**Important**: Update the `roleArn` values to match your AWS IAM roles.

### Step 5: Set GitHub Repository Variables

In your GitHub repository settings, create these **Variables** (not secrets):

- `PULUMI_ORGANIZATION`: Your Pulumi organization name

### Step 6: Test the Setup

1. Create a test PR to trigger the workflow
2. Check that authentication succeeds without `PULUMI_ACCESS_TOKEN`
3. Verify AWS credentials are injected properly
4. Confirm deployments work end-to-end

## 🔧 Environment Configuration Details

### AWS Login Configuration

```yaml
aws:
  login:
    fn::open::aws-login:
      oidc:
        duration: 1h                    # Token lifetime
        roleArn: arn:aws:iam::...:role/... # AWS role to assume
        sessionName: pulumi-esc-session # Session identifier
```

### Environment Variables

```yaml
environmentVariables:
  AWS_REGION: us-east-1
  PULUMI_ORGANIZATION: your-org
  ENVIRONMENT: staging
```

### Exported Outputs

```yaml
outputs:
  AWS_ACCESS_KEY_ID: ${aws.login.accessKeyId}
  AWS_SECRET_ACCESS_KEY: ${aws.login.secretAccessKey}
  AWS_SESSION_TOKEN: ${aws.login.sessionToken}
  AWS_REGION: ${environmentVariables.AWS_REGION}
```

## 🔍 Troubleshooting

### Authentication Failures

**Error**: `failed to exchange token`
- Check OIDC issuer configuration in Pulumi Cloud
- Verify subject pattern matches your repository
- Ensure audience is correct

**Error**: `AssumeRoleWithWebIdentity failed`
- Check IAM role trust policy
- Verify role ARN in ESC environment
- Ensure OIDC provider exists in AWS

### Permission Issues

**Error**: `Access Denied` during deployment
- Check IAM role permissions
- Verify policies are attached to the role
- Ensure least-privilege access

### Environment Issues

**Error**: `environment not found`
- Check environment name spelling
- Verify organization name in GitHub variables
- Ensure environment exists in Pulumi Cloud

## 📚 Additional Resources

- [Pulumi ESC Documentation](https://www.pulumi.com/docs/esc/)
- [Pulumi OIDC Guide](https://www.pulumi.com/docs/esc/oidc/)
- [GitHub OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

## 🔐 Security Best Practices

1. **Least Privilege**: Grant minimum required permissions to IAM roles
2. **Environment Separation**: Use separate roles for each environment
3. **Audit Regularly**: Review access patterns and permissions
4. **Rotate Regularly**: Update IAM role policies periodically
5. **Monitor Usage**: Set up CloudTrail logging for role usage