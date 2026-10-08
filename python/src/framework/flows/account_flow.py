"""Creates disposable accounts over the API so no test depends on a shared one.

This flow exists because of a failure this suite actually caused. The negative
sign-in tests send a wrong password on purpose. Against a shared demo account
that incremented a server-side failed-attempt counter until the account locked,
and the API began answering ``423 Locked`` to *every* login — including the
happy paths, in two language modules at once.

The account lockout was not a bug in the application. It was a test-design
defect: a shared account is shared mutable state, and the house rules say tests
own the data they need. A per-test account can be locked, abused, or left in any
state at all, because nothing else will ever use it.

**Accounts are not deleted afterwards.** The demo API offers no self-delete, and
every generated address is on ``example.invalid`` with the run id and process
tag embedded, so the ``af-`` janitor contract can find them. In a real project
this flow would register cleanup at creation time. This matches both shipped
modules; it is a property of the target, not a shortcut.
"""

from framework.clients.users_client import UsersClient
from framework.models.registration import PostalAddress, RegisterRequest
from framework.models.test_account import TestAccount
from framework.support import test_log, test_values


class AccountFlow:
    # Throwaway credential for a throwaway account on a public sandbox, created and
    # abandoned inside one test. Fixed rather than generated so it always satisfies the
    # application's complexity rules — a random one that occasionally failed them would
    # produce a flaky *setup* step. The exact literal both shipped modules use.
    _PASSWORD = "Str0ng-Pass!123"  # noqa: S105 - not a credential to any real system
    _DUPLICATE_EMAIL_STATUS = 409

    def __init__(self, users_client: UsersClient) -> None:
        self._users_client = users_client

    def create_customer(self) -> TestAccount:
        """Registers a fresh customer account and returns its credentials.

        Raises ``RuntimeError`` when registration is refused, including the
        duplicate case where the generated address is already registered.
        Failing here with the status is far clearer than letting every later
        assertion fail against a sign-in that could never have worked.
        """
        # Logged through test_log rather than recorded as an Allure step. The bare step
        # overload in the C# module started a step nothing closed and hung the suite; the
        # Python equivalent is safe, but this log line is what the other two modules emit
        # and parity on output matters more than a nested step here.
        test_log.info("Registering a disposable customer account via the API")

        email = test_values.unique_email()

        request = RegisterRequest(
            first_name="Af",
            last_name="Tester",
            address=PostalAddress(
                street="1 Test Street",
                city="Testville",
                state="TS",
                country="PH",
                postal_code="1000",
            ),
            phone=test_values.reserved_phone_number(),
            date_of_birth="1990-01-01",
            email=email,
            password=self._PASSWORD,
        )

        result = self._users_client.register(request)

        if result.status == self._DUPLICATE_EMAIL_STATUS:
            raise RuntimeError(
                f"Registration was refused as a duplicate ({self._DUPLICATE_EMAIL_STATUS}): "
                f"the email {email} is already registered, so two processes generated the "
                'same identity. Compare the runId and processTag on the "Environment ... '
                'resolved" line in each log: AF_RUN_ID pins the run id deliberately, but '
                f"the process tag must differ between processes. Body: {result.raw_body}"
            )

        if not result.is_successful():
            raise RuntimeError(
                f"Could not register a test account ({result.status}). Body: {result.raw_body}"
            )

        test_log.info(f"Registered disposable account {email}")
        return TestAccount(email=email, password=self._PASSWORD)
