# Quick Release Steps

From repo root:

```bash
cd /Users/shop/inspections-app
npm run release:check
git add -A
git commit -m "release: <summary>"
git push origin main
```

## If DB schema changed

```bash
npx supabase db push --linked
```

## If mobile shell changed (iOS)

```bash
npx cap sync ios
npx cap open ios
```
