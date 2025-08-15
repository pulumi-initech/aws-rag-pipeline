# GitHub Actions CI/CD Pipeline

Multi-stage pipeline ensuring code quality, security, and reliable deployments.

## 📁 Workflow Files

- **`quality-and-tests.yml`** - Reusable workflow for quality checks and unit tests
- **`pr.yml`** - Pull request validation with ephemeral infrastructure
- **`push.yml`** - Main branch deployment (staging → production)

## 🔄 Pipeline Flow

**Pull Requests**: Quality checks → Unit tests → Integration tests (ephemeral stack)
**Push to Main**: Quality checks → Unit tests → Deploy staging → E2E tests → Deploy production
**Manual**: Quality checks → Unit tests → Deploy to selected environment

## 🚀 Workflow Architecture

```mermaid
graph TD
    subgraph "Reusable Workflow"
        RW[quality-and-tests.yml]
        QC[Quality Checks<br/>ESLint, TypeScript, Security]
        UT[Unit Tests<br/>Component Testing]
        RW --> QC
        QC --> UT
    end
    
    subgraph "Pull Request Flow (pr.yml)"
        PR[Pull Request Created] --> RW
        UT --> PV[Preview Changes<br/>Pulumi Preview]
        PV --> IT[Integration Tests<br/>Ephemeral Stack pr-{number}]
        IT --> CL[Cleanup<br/>Destroy Stack]
    end
    
    subgraph "Main Branch Flow (push.yml)"
        PUSH[Push to Main] --> RW
        UT --> DS[Deploy Staging<br/>staging stack]
        DS --> E2E[Integration & E2E Tests<br/>Real Infrastructure]
        E2E --> DP[Deploy Production<br/>Manual Approval Required]
        DP --> HC[Health Checks]
    end
    
    subgraph "Manual Deployment"
        MD[workflow_dispatch] --> RW
        UT --> MDeploy[Deploy to Environment<br/>staging or production]
    end
    
    style RW fill:#e1f5fe
    style QC fill:#f3e5f5
    style UT fill:#f3e5f5
    style IT fill:#fff3e0
    style E2E fill:#fff3e0
    style CL fill:#ffebee
    style HC fill:#e8f5e8
```

## 🔧 Key Features

**Reusable Workflow**: `quality-and-tests.yml` eliminates code duplication - quality checks and unit tests defined once, used by both PR and push workflows.

**Security**: OIDC authentication, short-lived tokens, ephemeral PR stacks with automatic cleanup.

**Testing**: Unit tests → Integration tests (real AWS) → E2E tests (full pipeline).

## ⚙️ Setup

1. Configure OIDC authentication (see `.pulumi/OIDC-SETUP.md`)
2. Create GitHub environments: `pr-testing`, `staging`, `production`
3. Set repository variable: `PULUMI_ORGANIZATION`

## 🐛 Troubleshooting

```bash
# Check stack status
pulumi stack ls --all

# View workflow runs
gh run list --workflow=push.yml

# Download logs
gh run download <run-id>
```