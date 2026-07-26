# MES Platform — Coding Standards

This document establishes the coding conventions, design principles, and formatting standards for the MES Platform Go codebase.

## 1. Core Principles

- **SOLID**: Follow Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, and Dependency Inversion.
- **DRY (Don't Repeat Yourself)**: Extract common utilities (like string formatting or response wrappers) into `/shared/` or `/pkg/`.
- **KISS (Keep It Simple, Stupid)**: Avoid over-engineering. Prefer readable code over clever/compact code.
- **YAGNI (You Aren't Gonna Need It)**: Do not write code for future requirements. Focus on the current phase.
- **Composition over Inheritance**: Since Go does not have class inheritance, embed structs cleanly to share functionality (e.g. `domain.AggregateRoot` in entities).

---

## 2. Formatting & Tools

- Run `gofmt` to format all code.
- Run `goimports` to sort imports.
- Lint using `golangci-lint` (make sure it passes before committing).
- Never ignore errors. Check every return error:
```go
val, err := DoSomething()
if err != nil {
    return nil, fmt.Errorf("do something failed: %w", err)
}
```

---

## 3. Variable and Function Naming

- **Packages**: lowercase, single word, no underscores (e.g. `persistence`, `handler`).
- **Interfaces**: end with "er" if possible (e.g. `Publisher`, `UserRepository`).
- **Structs & Types**: PascalCase (e.g. `User`, `IdentityService`).
- **Functions & Methods**: PascalCase if exported, camelCase if private.
- **Constants**: PascalCase or ALL_CAPS depending on scope.
- **Short Variable Names**: Local loop indices should be short (e.g., `i`, `v`). Long-lived variables must have descriptive names (e.g., `userID`, `userRepo`).

---

## 4. Error Handling

- Return errors as the last return parameter.
- Use `%w` verb to wrap errors so calling layers can unwrap or match them using `errors.Is` or `errors.As`.
- Custom module errors must be declared as sentinel errors at the package level:
```go
var ErrUserNotFound = errors.New("user not found")
```

---

## 5. Dependency Injection

- **Never use global variables** (such as global DB or Logger connections).
- Inject all dependencies via constructor functions:
```go
func NewIdentityService(userRepo repository.UserRepository, log *logger.Logger) *IdentityService {
    return &IdentityService{
        userRepo: userRepo,
        log:      log,
    }
}
```
- Wire all dependencies once at startup in `/internal/bootstrap/app.go` (Composition Root).
