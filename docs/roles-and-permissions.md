# Roles and permissions

The matrix lives in two places that must stay in sync:

- `src/config/roles.ts` decides what the **app shows** (menus, buttons, which records are fetched).
- `firestore.rules` decides what the **database allows**, so nobody can bypass the UI.

`npm run test:rules` checks the important cases against the emulator.

## Who sees what

The same table is shown in the app under **Users & roles > Roles & permissions**, generated from `roles.ts`.

Legend: **Full** = view, add, edit, delete all records · **View** = read-only, all records · **Own** = add, and see/edit only their own entries · **Linked** = only records for their client company · – = hidden

| Module | Admin | Project Manager | HR Manager | Sales Staff | Other Staff | Client | Investor | Viewer |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Employees | Full | View | View | – | – | – | View | View |
| Attendance (team view) | Full | View & correct | View | – | – | – | View | View |
| My Attendance (check in/out) | Own | Own | Own | Own | Own | – | – | – |
| Leave | Full (approves) | View all, edit own | Full (approves) | Own | Own | – | View | View |
| Hiring (candidates) | Full | – | Full | – | – | – | – | – |
| Salary structure | Full | – | Full | – | – | – | – | – |
| Resignations | Full | – | Full | – | – | – | – | – |
| Leads and follow-ups | Full | View | – | Full | – | – | – | View |
| Estimates | Full | View | – | Full | – | – | View | View |
| Clients | Full | View | – | Full | – | – | View | View |
| Products & services | Full | View | View | Full | View | – | View | View |
| Sales gallery | Full | View | View | Full | View | – | View | View |
| Projects | Full | Full | View | View | View | Linked | View | View |
| Timesheets | Full | Full | Own | Own | Own | – | – | – |
| Suppliers, purchase bills | Full | – | – | – | – | – | View | View |
| Invoices | Full | View | – | Add & edit (no delete) | – | Linked | View | View |
| Payments | Full | – | – | Record received | – | – | View | View |
| Expenses | Full (approves) | Own | Own | Own | Own | – | View | View |
| Reports | Full | – | – | – | – | – | View | View |
| Settings, Users & roles | Full | – | – | – | – | – | – | – |
| Activity log | View (read-only) | – | – | – | – | – | – | – |

## Rules that protect the workflow

- New sign-ups are **pending** and see nothing until an admin gives them a role. Nobody can set their own role.
- **Invitations** (`invites/{email}`) let an admin set the role in advance. The person gets it on first sign-in only if their email is verified (Google sign-in) and matches; the rules check the role, client and employee link against the invitation.
- **HR Manager** can create employee records (not edit them) and invitations only for the Other Staff role with no client link, so a hired candidate can be converted into a team member.
- **Files** (certificates, signed offers) are stored in the `files` collection as data (under 1 MB each) because Firebase Storage needs the paid plan. Only Admin and HR can read or delete them.
- **Activity log** (`logs`): everyone signed in adds entries for their own sign-ins and changes, stamped with the server time. Nobody can edit or delete an entry, and only Admin can read them.
- Giving someone a team role (Project Manager, HR, Sales, Other Staff) creates their **employee record** automatically; only admins edit employee records.
- Admins can't change their own role or disable themselves, so the company always keeps an admin.
- Staff can edit or withdraw their own leave and expense claims **only while pending**, and can never approve them.
- Staff check in and check out once; afterwards only Admin and Project Managers can correct the entry.
- Sales staff can record money **received** against invoices; only admins record money paid out against purchase bills.
- Every record stores who created it (`userId`) and whose employee record it belongs to (`employeeId`), and neither can be changed afterwards.
- Disabling a user (Users & roles > Account active) cuts off their access immediately.
- Project budgets are hidden from Clients and Other Staff in the app.

## Changing a permission

1. Edit `PERMISSIONS` in `src/config/roles.ts`.
2. Make the same change in the matching `match /<collection>/{id}` block of `firestore.rules`.
3. Run `npm run test:rules`, then deploy the rules with `npx firebase deploy --only firestore:rules`.
