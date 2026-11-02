# Dependency versions and upgrades

Application versions were checked against the registry's stable `latest` tags and the official image manifests on 2026-11-01. pnpm 12.16.1 and the form dependencies were checked on 2026-11-02. Application dependencies use exact pins with a committed lockfile. Images use explicit stable release tags so upgrades can be reviewed and reproduced.

| Component                                     | Version |
| --------------------------------------------- | ------- |
| Node.js                                       | 26.13.0 |
| pnpm                                          | 12.16.1 |
| Redis server                                  | 8.10.3  |
| Redis Node client                             | 6.3.1   |
| Next.js                                       | 16.4.3  |
| React / React DOM                             | 19.3.1  |
| Tailwind CSS / PostCSS integration            | 4.3.3   |
| TypeScript native compiler                    | 7.0.2   |
| TypeScript compiler API compatibility package | 6.0.2   |
| ESLint                                        | 10.14.0 |
| ESLint React                                  | 5.28.8  |
| TypeScript ESLint                             | 8.72.1  |
| React Hooks ESLint plugin                     | 7.1.1   |
| Next.js ESLint plugin                         | 16.4.3  |
| Playwright                                    | 1.64.1  |
| Vitest                                        | 5.0.5   |
| React Hook Form                               | 7.91.0  |
| Hook Form resolvers                           | 7.0.1   |
| Valibot                                       | 1.5.0   |
| Prettier                                      | 3.9.10  |
| Motion                                        | 14.9.0  |
| cn                                            | 0.5.1   |

The complete dependency list is in `package.json` and `pnpm-lock.yaml`. Other dependencies were already at their current stable releases. Server and client package version numbers are independent; the Redis client does not need to share the server's major version.

## TypeScript compatibility

TypeScript 7.0 does not expose the old JavaScript compiler API used by TypeScript ESLint and some framework tooling. This project follows Microsoft's documented side-by-side setup:

- `@typescript/native` aliases `typescript@7.0.2` and supplies the `tsc` command used by `pnpm run typecheck`.
- The `typescript` module aliases `@typescript/typescript6@6.0.2`, the current stable compatibility package, for tooling that still requires the compiler API.

This preserves native TypeScript 7 checks without disabling lint rules or forcing unsupported peer dependencies. Next.js retains its supported build-time checker through the compatibility module.

ESLint 10 uses the current official Next.js plugin, modern React lint rules, TypeScript ESLint, and React Hooks rules. The old aggregate preset depended on legacy plugins whose peer ranges stop at ESLint 9, so it has been replaced instead of overriding their peer requirements.

## Package installation

pnpm 12 blocks unreviewed dependency build scripts. The `allowBuilds` policy in `pnpm-workspace.yaml` permits the pinned SQLite and esbuild scripts needed by this application. `strictDepBuilds` and `strictPeerDependencies` keep unreviewed builds and incompatible dependency trees from passing installation. Review approvals when these packages change.

Use `pnpm install --frozen-lockfile` for reproducible installation. After an intentional dependency upgrade, commit the manifest and lockfile together and check `pnpm list --depth Infinity` for invalid peers. Do not use `--force` or `--legacy-peer-deps` to conceal incompatibility.

## Upgrade checklist

1. Check stable release tags and peer/runtime requirements.
2. Update exact version pins, runtime files, image tags, and the lockfile together.
3. Run lint, native type checks, integration tests, production build, and browser tests.
4. Build the image and verify web/worker startup against the actual Redis version.
5. Back up persistent storage before changing server major versions. Never delete a volume to hide a migration failure.
6. Keep the documentation version table consistent with the tested versions.

## Sources

- [Official Redis image versions](https://github.com/docker-library/official-images/blob/master/library/redis)
- [Official Node image versions](https://github.com/docker-library/official-images/blob/master/library/node)
- [TypeScript 7 and compatibility guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [ESLint React TypeScript setup](https://eslint-react.xyz/docs/getting-started/typescript)
- [Next.js project-owned agent instructions](https://nextjs.org/docs/app/api-reference/config/next-config-js/agentRules)

- [pnpm build-script policy](https://pnpm.io/settings/build#allowbuilds)

The Rare UI OTP source is vendored in `src/shared/ui/otp-input.tsx`; shadcn 4.23.0 was used as an installation CLI and is not an application dependency. The component's motion features are dynamically imported. Its `cn` helper follows the installed registry's current dependency rather than adding a second class-name utility stack.
