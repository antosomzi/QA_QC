# `sign_codes.json` purpose

`sign_codes.json` stores the list of traffic sign codes that **Pima County wants to detect**.

This list is used to compute `belongsToList122` on annotations:
- `true` = the annotation `signType` is in this list
- `false` = the annotation `signType` is not in this list

## If you modify `sign_codes.json`

After any change to the list, you must re-run the backfill so existing annotations are recalculated.

### Production (Docker)

```bash
docker compose exec app npm run db:backfill:belongs-to-list-122:dry
docker compose exec app npm run db:backfill:belongs-to-list-122
```

### Development (local, without Docker)

```bash
npm run db:backfill:belongs-to-list-122:dry
npm run db:backfill:belongs-to-list-122
```

## Notes

- No JSON comments are allowed in `sign_codes.json`.
- New annotations are computed at creation time; backfill is for existing rows.
