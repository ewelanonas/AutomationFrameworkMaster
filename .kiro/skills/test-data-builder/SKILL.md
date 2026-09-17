---
name: test-data-builder
description: Create or refactor test data builders, factories, and fixtures that produce valid-by-default objects with fluent overrides, seeded fake data, unique run-scoped values, and idempotent cleanup, in C#, Java, Python, or TypeScript. Use when asked to add test data, a builder, a factory, a fixture that seeds records, or to remove hardcoded test data and magic values.
---

# Test Data Builders

## The goal

A test should contain only the values that matter to it. Everything else comes
from a builder that produces a valid object by default.

```text
// bad: which of these fields is the test about?
new Customer("Jose", "Rizal", "1896-12-30", "PH", "4111111111111111", "01/20", 3, true)

// good: the test is about the expired card
CustomerBuilder.Valid().WithExpiredCard().Build()
```

## Rules

1. **Valid by default.** `Valid()` / `valid()` / `customer_builder()` /
   `customerBuilder()` returns an object that the system under test accepts.
   Every future test starts from a working object.
2. **One override per intent.** Name methods after the business meaning, not
   the field: `WithExpiredCard()`, not `WithCardExpiry("01/20")`. Field-level
   setters are allowed as an escape hatch, but the named intents are what tests
   should read like.
3. **Unique where uniqueness matters.** Emails, usernames, order references,
   and external ids include the run id: `af-{runId}-{seq}@example.invalid`.
   Reserved domains only (`example.com`, `example.invalid`, `test.invalid`).
4. **Seeded randomness.** One faker instance per run, seeded from config
   (`AF_DATA_SEED`), and the seed is logged and attached to the report. A
   failure must be reproducible.
5. **Never randomize what you assert.** If the assertion depends on the value,
   either set it explicitly in the test or derive the expectation from the same
   builder output — never from an independent random draw.
6. **Immutable and fluent.** Each `With...` returns a new instance so a shared
   base builder cannot leak state between tests. This matters in parallel runs.
7. **Builders build, they do not persist.** A builder returns an object. A
   fixture or a client persists it. Keeping these separate lets you use the same
   builder for a request payload and for a seeded record.
8. **Invalid variants are explicit.** Provide named invalid states
   (`WithMissingEmail()`, `WithNegativeQuantity()`) so negative tests read as
   clearly as positive ones.
9. **Written in the plainest form the language allows.** Builders are read by
   everyone on the team, including people whose main language is a different
   one. Ordinary classes, ordinary methods with bodies, ordinary assignments.
   No LINQ or stream chains, no `reduce`, no reflection-driven mapping, no
   annotation processors that generate the builder out of sight. If someone
   cannot follow what a `With...` method changes, the builder has failed at its
   only job.

## Persistence and cleanup

A data fixture that creates a record must:

- Create via the fastest reliable path (API, then seed endpoint, then DB).
- Register cleanup **at creation time**, so it runs when the test body fails.
- Be idempotent on delete: a 404 during cleanup is a success.
- Log a warning with the orphan id on cleanup failure, and not fail an
  otherwise-passing test — but surface it in the report so orphans get noticed.
- Never share a created record between tests. One creator, one owner.

## Per-language shape

**C#** — a plain class with ordinary properties and ordinary methods. No LINQ,
no nested `with` expressions, no clever record copying:

```csharp
public sealed class CustomerBuilder
{
    private string _email;
    private string _cardNumber;
    private string _cardExpiry;

    private CustomerBuilder()
    {
        _email = TestValues.UniqueEmail();       // af-{runId}-{n}@example.invalid
        _cardNumber = TestValues.ValidCardNumber();
        _cardExpiry = "12/30";
    }

    public static CustomerBuilder Valid()
    {
        return new CustomerBuilder();
    }

    public CustomerBuilder WithExpiredCard()
    {
        var copy = Copy();
        copy._cardExpiry = "01/20";
        return copy;
    }

    public CustomerBuilder WithEmail(string email)
    {
        var copy = Copy();
        copy._email = email;
        return copy;
    }

    public Customer Build()
    {
        return new Customer(_email, _cardNumber, _cardExpiry);
    }

    private CustomerBuilder Copy()
    {
        return (CustomerBuilder)MemberwiseClone();
    }
}
```

Every method has a body you can step through in a debugger. `Copy()` keeps the
builder immutable so two tests sharing a `Valid()` starting point cannot affect
each other in a parallel run.

**Java** — the same shape: a plain class, private fields, `with...` methods that
copy and return. No streams, no `Optional` chains, no builder-generator
annotations that hide the code:

```java
public final class CustomerBuilder {
  private String email = TestValues.uniqueEmail();
  private String cardNumber = TestValues.validCardNumber();
  private String cardExpiry = "12/30";

  public static CustomerBuilder valid() {
    return new CustomerBuilder();
  }

  public CustomerBuilder withExpiredCard() {
    CustomerBuilder copy = this.copy();
    copy.cardExpiry = "01/20";
    return copy;
  }

  public Customer build() {
    return new Customer(email, cardNumber, cardExpiry);
  }

  private CustomerBuilder copy() {
    CustomerBuilder copy = new CustomerBuilder();
    copy.email = this.email;
    copy.cardNumber = this.cardNumber;
    copy.cardExpiry = this.cardExpiry;
    return copy;
  }
}
```

Keep the Datafaker instance in a `ThreadLocal`, seeded once per run.

**Python** — a `@dataclass`-free approach on top of Pydantic:

```python
def customer_builder() -> CustomerBuilder:
    return CustomerBuilder(Customer(email=unique_email(), card=valid_card()))

class CustomerBuilder:
    def __init__(self, value: Customer) -> None: self._value = value
    def with_expired_card(self) -> "CustomerBuilder":
        return CustomerBuilder(self._value.model_copy(update={"card": expired_card()}))
    def build(self) -> Customer: return self._value
```

`model_copy` gives you immutability for free.

**TypeScript** — a function returning an object with `with*` methods, typed from
the Zod schema so the builder cannot drift from the contract. Keep each method
to one plain statement; no nested spreads:

```ts
export function customerBuilder(value: Customer = validCustomer()) {
  return {
    withExpiredCard(): ReturnType<typeof customerBuilder> {
      const card = { ...value.card, expiry: '01/20' };
      return customerBuilder({ ...value, card });
    },

    withEmail(email: string): ReturnType<typeof customerBuilder> {
      return customerBuilder({ ...value, email });
    },

    build(): Customer {
      return CustomerSchema.parse(value);
    },
  };
}
```

Pulling `card` onto its own line is the whole difference between readable and
not. Parsing in `build()` means an invalid default fails at build time, not
deep inside a request.

## Shared data files

- Payloads needed by more than one language go in `shared/testdata/` as JSON,
  with a schema in `shared/contracts/`.
- Each module loads them through a typed loader in `support/` that validates
  against the schema on load and fails fast on mismatch.
- Never fork a shared file into a module. Add a variant instead.

## Anti-patterns

- A test constructor call with more than three positional literals.
- Magic values with no explanation (`"12345"`, `"test@test.com"`).
- Fixed record ids assumed to exist in the environment.
- Real customer data, production dumps, or real PII, ever.
- Real email domains or real phone numbers.
- Unseeded `random`/`faker` producing unreproducible failures.
- A mutable static/shared builder instance.
- Builders that call the API inside `Build()`.
- Cleanup registered after the test body, so a mid-test failure orphans data.
- A single 500-line `TestData` class holding everything.
