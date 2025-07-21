## 📋 Summary

Brief description of what this PR does and why.

## 🔄 Type of Change

- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🔧 Infrastructure/tooling change
- [ ] 🧹 Code cleanup/refactoring

## 🧪 Testing

- [ ] Unit tests pass (`pnpm run test:unit`)
- [ ] Linting passes (`pnpm run lint:check`)
- [ ] TypeScript compilation successful (`pnpm run build`)
- [ ] Integration tests will be run automatically
- [ ] E2E tests will be validated in staging

### Manual Testing (if applicable)
Describe any manual testing performed:

## 🏗️ Infrastructure Changes

- [ ] No infrastructure changes
- [ ] New AWS resources added
- [ ] Existing resources modified
- [ ] IAM permissions changed
- [ ] Environment variables/secrets updated

### Pulumi Preview
If infrastructure changes, paste the `pulumi preview` output:
```
<Paste pulumi preview output here>
```

## 🔒 Security Considerations

- [ ] No sensitive data added to code
- [ ] Secrets properly configured in GitHub/ESC
- [ ] IAM permissions follow least privilege principle
- [ ] Dependencies scanned for vulnerabilities

## 📖 Documentation

- [ ] Code is self-documenting
- [ ] README updated if needed
- [ ] API documentation updated
- [ ] Deployment guide updated if needed

## ✅ Checklist

- [ ] PR title follows conventional commit format
- [ ] Code follows project style guidelines
- [ ] Self-review of the code completed
- [ ] Comments added in hard-to-understand areas
- [ ] No console.log statements left in production code
- [ ] Breaking changes documented

## 📸 Screenshots (if applicable)

Add screenshots for UI changes or architecture diagrams for infrastructure changes.

## 🔗 Related Issues

Closes #
Related to #

## 🚀 Deployment Notes

Any special considerations for deployment:
- [ ] Requires manual steps
- [ ] Database migrations needed
- [ ] Environment variables need updating
- [ ] Rollback plan documented

---

**Note**: This PR will automatically:
1. Run quality checks (linting, build, security scan)
2. Execute unit tests with coverage
3. Deploy ephemeral infrastructure for integration testing
4. Clean up resources after testing

The integration tests will validate your changes against real AWS infrastructure in an isolated environment.