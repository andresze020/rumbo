---
name: app-finanzas-supabase-rls
description: Use when working on Supabase/PostgreSQL migrations, RLS, database functions, views, RPCs, policies, indexes, constraints, or seed/default data for App Finanzas.
---

# App Finanzas Supabase and RLS Guard

Use this skill for database work.

## Non-negotiables

- Use SQL migrations for schema, functions, views, constraints, indexes, triggers, and RLS.
- Preserve household isolation.
- Every household-scoped table must include `household_id`.
- RLS policies must prevent cross-household access.
- Do not use service-role assumptions in browser/client code.
- Do not expose secrets or read `.env` files.
- Do not run `npx supabase db push`.
- Do not run remote/write Supabase commands.
- Prepare migrations and list commands for the user to run manually.

## Migration expectations

For any DB change:
1. Inspect existing migration history and current schema.
2. Create a new timestamped migration under `supabase/migrations`.
3. Use `create table if not exists` only when appropriate.
4. Prefer additive migrations.
5. Avoid destructive changes unless explicitly approved.
6. Add indexes for frequent filters and joins.
7. Add constraints for financial integrity.
8. Add or update RLS policies if the table is household-scoped.
9. Explain rollback considerations.

## RLS checklist

For household-scoped tables:
- Enable RLS.
- SELECT: active household member.
- INSERT/UPDATE: proper role check.
- DELETE: avoid physical delete for financial records.
- Use existing helper functions if present:
  - `is_household_member`
  - `is_household_admin`
  - `is_household_editor`
  - `has_household_role`

## Required final DB section

Always include:

```text
Database impact
- New/changed migrations:
- Tables affected:
- RLS affected:
- Functions/views affected:
- Manual Supabase command for user:
  npx supabase db push
- Verification queries:
```

## Manual verification examples

```sql
select * from public.v_account_balances limit 10;
select tablename, rowsecurity from pg_tables where schemaname = 'public';
```
