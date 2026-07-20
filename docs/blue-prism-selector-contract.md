# Blue Prism selector contract

FutureBank exposes a stable DOM contract so Blue Prism processes do not depend on generated CSS classes, element positions, or visible styling.

## Page readiness

Every route has exactly one page root with a permanent page name and an explicit ready state:

```html
<main data-bp-page="customers" data-bp-ready="true">...</main>
```

Automation must wait for `[data-bp-page="<name>"][data-bp-ready="true"]` before interacting. The page name is a public compatibility surface and must not be renamed without updating the Blue Prism processes and E2E suite.

## Controls

Every `input`, `select`, `textarea`, and `button` must have:

- A permanent, unique `data-bp` value within the page.
- Stable `id` and `name` attributes.
- An associated `<label for="...">`, `aria-label`, or `aria-labelledby`. Text buttons may use their stable visible name.
- A native HTML control where the platform provides one.

Examples:

```html
<label for="login-username">Username</label>
<input id="login-username" name="username" data-bp="login-username" />
<button id="login-submit" name="login-submit" data-bp="login-submit">Sign in</button>
```

Do not use generated IDs, shadow DOM, canvas controls, virtualized tables, hover-only actions, or portal-based list boxes in automatable journeys.

## Results and errors

- Successful mutations render a persistent `[role="status"]` region with a deterministic message.
- Failed validation or server mutations render `[role="alert"]`; field errors are associated through `aria-describedby`.
- Tables use native `<table>`, `<thead>`, `<tbody>`, `<th>`, and `<td>` elements and retain stable column order.
- Destructive actions require a normal text confirmation field and submit button; browser-native prompt dialogs are not part of the contract.

## Canonical journeys

The Playwright suite treats these workflows as the compatibility baseline:

1. Sign in and sign out.
2. Use universal search for a deterministic customer and account.
3. Search for a deterministic seeded customer, edit a contact field, and onboard a fictional customer.
4. Open and maintain an account, inspect its statement, and verify loan records are read-only.
5. Create a beneficiary and a payment with idempotent retry and insufficient-funds validation.
6. Reset the demonstration data as an administrator and restore exactly five baseline customers.

The reset journey is destructive and only runs when `PLAYWRIGHT_ALLOW_RESET=true`.
