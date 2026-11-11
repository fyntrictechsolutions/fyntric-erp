# Roles and permissions

The matrix lives in two places that must stay in sync:

- `src/config/roles.ts` decides what the **app shows** (menus, buttons, which records are fetched).
- `firestore.rules` decides what the **database allows**, so nobody can bypass the UI.

`npm run test:rules` checks the important cases against the emulator.

## Who sees what

Legend: **Full** = view, add, edit, delete all records · **View** = read-only, all records · **Own** = add, and see/edit only their own entries · **Linked** = only records for their client company · – = hidden

| Module | Admin | Project Manager | HR Manager | Sales Staff | Other Staff | Client | Investor | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Employees | Full | View | Full | View | View | – | – | – |
| Attendance | Full | Own | Full | Own | Own | – | – | – |
| Leave | Full (approves) | Own | Full (approves) | Own | Own | – | – | – |
| Leads | Full | View | – | Full | – | – | – | View |
| Clients | Full | View | – | Full | – | – | View | View |
| Projects | Full | Full | View | View | View | Linked | View | View |
| Timesheets | Full | Full | Own | Own | Own | – | – | – |
| Invoices | Full | View | – | Add & edit (no delete) | – | Linked | View | – |
| Expenses | Full (approves) | Own | Own | Own | Own | – | View | – |
| Users & roles | Full | – | – | – | – | – | – | – |

## Rules that protect the workflow

- New sign-ups are **pending** and see nothing until an admin gives them a role. Nobody can set their own role.
- Admins can't change their own role or disable themselves, so the company always keeps an admin.
- Staff can edit or withdraw their own leave and expense claims **only while pending**, and can never approve them.
- Staff can add a check-out time to their attendance but can't change the date or check-in time.
- Every record stores who created it (`userId`), and that can't be changed afterwards.
- Disabling a user (Users & roles > Account active) cuts off their access immediately.
- Project budgets are hidden from Clients and Other Staff in the app.

## Changing a permission

1. Edit `PERMISSIONS` in `src/config/roles.ts`.
2. Make the same change in the matching `match /<collection>/{id}` block of `firestore.rules`.
3. Run `npm run test:rules`, then deploy the rules with `npx firebase deploy --only firestore:rules`.
