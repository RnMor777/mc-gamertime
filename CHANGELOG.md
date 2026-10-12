# Changelog

## [0.3.3](https://github.com/Strandgaard96/mc-gamertime/compare/v0.3.2...v0.3.3) (2026-10-12)


### Bug Fixes

* **deps:** patch Dependabot security alerts ([4605215](https://github.com/Strandgaard96/mc-gamertime/commit/46052155e890933efb4178a91cde309183060874))
* **deps:** patch Dependabot security alerts ([8ed027b](https://github.com/Strandgaard96/mc-gamertime/commit/8ed027b3c4ca9413d48fc0342fa163de6abaf892))
* **deps:** regenerate docs-site lockfile with npm 10 ([355ff80](https://github.com/Strandgaard96/mc-gamertime/commit/355ff80d3410bfb7e5cbc0bac03e23b141493998))

## [0.3.2](https://github.com/Strandgaard96/mc-gamertime/compare/v0.3.1...v0.3.2) (2026-10-07)


### Bug Fixes

* **web:** render post text in the theme foreground colour ([f513ecc](https://github.com/Strandgaard96/mc-gamertime/commit/f513ecc622661bb8bf6af7b432b5a4a4367a0a6a))
* **web:** render post text in the theme foreground colour ([fc68420](https://github.com/Strandgaard96/mc-gamertime/commit/fc6842025d38f1066f46053e880e674beb016c2b))

## [0.3.1](https://github.com/Strandgaard96/mc-gamertime/compare/v0.3.0...v0.3.1) (2026-10-07)


### Bug Fixes

* **infra:** fit media behaviours in CloudFront free-plan limit ([8a8aed4](https://github.com/Strandgaard96/mc-gamertime/commit/8a8aed43832c8bc42d38109d5ee4b6b78316e682))
* **infra:** fit media behaviours in CloudFront free-plan limit ([796e7fa](https://github.com/Strandgaard96/mc-gamertime/commit/796e7faae3c9bcf98ce9fa49752cd44bdc8e6260))

## [0.3.0](https://github.com/Strandgaard96/mc-gamertime/compare/v0.2.3...v0.3.0) (2026-10-07)


### Features

* add session-photos media prefix and upload key helpers ([3517db4](https://github.com/Strandgaard96/mc-gamertime/commit/3517db4c0f509f0598be6f3537c4ad519da92677))
* **api:** add Giant Slayer achievement ([30fcedb](https://github.com/Strandgaard96/mc-gamertime/commit/30fcedb63c81830b98f9346b6dddec8f5d72bd8c))
* **api:** add quarterly season helpers and champion rule ([7562502](https://github.com/Strandgaard96/mc-gamertime/commit/756250291f94da5143942849fba05060881ea4fc))
* **api:** game-night photo upload, confirm, delete and cascade ([0e1be62](https://github.com/Strandgaard96/mc-gamertime/commit/0e1be62fa20e42c04c6b029b00e55d296732d437))
* **api:** season-scoped stats, season list and player season titles ([f0a2be6](https://github.com/Strandgaard96/mc-gamertime/commit/f0a2be69abce978047f96722e79b0c28029b2679))
* quarterly seasons, Giant Slayer achievement and game-night photos ([27d2dba](https://github.com/Strandgaard96/mc-gamertime/commit/27d2dbac8ef978200e624ea99954dc94f56ec4e7))
* **web:** attach photos when logging a game night ([0398cfb](https://github.com/Strandgaard96/mc-gamertime/commit/0398cfb4a4a0247c0f8d9b19855af8a3bea6b68e))
* **web:** game-night photo strip, lightbox and upload ([2861a44](https://github.com/Strandgaard96/mc-gamertime/commit/2861a443e0e3565e3134e3d64ecb030c6b2e6bd1))
* **web:** season leaderboard scope and champion chips ([5e8cb80](https://github.com/Strandgaard96/mc-gamertime/commit/5e8cb802b424f0d641994ce352bbdfbf38bdd1a8))


### Bug Fixes

* **api:** map BoardGameGeek failures to 502/504/404 ([1d0c9e6](https://github.com/Strandgaard96/mc-gamertime/commit/1d0c9e6dc370c8e19c4ee1b7fd1d22777737425f))
* **api:** stop user writes clobbering concurrent changes; trust DB role ([b9fd0c0](https://github.com/Strandgaard96/mc-gamertime/commit/b9fd0c033f78c701deef817cac74c87377718baf))
* bind photo uploads to a server-issued size and token ([0a30e62](https://github.com/Strandgaard96/mc-gamertime/commit/0a30e62838a719fd4fe3052d151d978f9f8880e6))
* defects from maintenance review (API + web) ([0778906](https://github.com/Strandgaard96/mc-gamertime/commit/0778906104c4ea4d0f520b2ec2d73861dc2e98ad))
* delete session photos before the result ([5893db2](https://github.com/Strandgaard96/mc-gamertime/commit/5893db26fac35d7cd43c0913f6c38b2c9cb5521e))
* surface startup failures and 404 unknown API paths ([cc4dcc2](https://github.com/Strandgaard96/mc-gamertime/commit/cc4dcc2a454a06776e83575669fb1b0682af870d))
* **web:** clear the query cache when a session ends ([7cf3cd8](https://github.com/Strandgaard96/mc-gamertime/commit/7cf3cd8b620d39e8d438bb23357b119cc8da60d4))
* **web:** compute the result-date bound per validation ([b450196](https://github.com/Strandgaard96/mc-gamertime/commit/b45019696e51dc66ce1258f0ac710957c3b9375c))
* **web:** give every API error a status so 4xx is not retried ([1cb81df](https://github.com/Strandgaard96/mc-gamertime/commit/1cb81df168f7c5c09478b4b0cb3909573f48fb83))
* **web:** ignore a malformed ?season deep link on the leaderboard ([e18b8e4](https://github.com/Strandgaard96/mc-gamertime/commit/e18b8e4397e7794ef5855c90a3aa66d1a8fa9daf))
* **web:** keep previous stats while a new season loads ([7f56f0a](https://github.com/Strandgaard96/mc-gamertime/commit/7f56f0a459635545611bfd826846f8cd845f23b4))
* **web:** lightbox arrow keys work from any focused element ([597e0c5](https://github.com/Strandgaard96/mc-gamertime/commit/597e0c5eae681776c7de6148f2180ac7d2c256ff))
* **web:** only fetch the admin-only user list when logging a result ([2c4b970](https://github.com/Strandgaard96/mc-gamertime/commit/2c4b970ec5e708a54b8eabf6a196f6551cf7f44c))


### Performance

* **api:** reuse one SQLite connection per table ([f2bb917](https://github.com/Strandgaard96/mc-gamertime/commit/f2bb9177fc35fdf39427b4c5b8422cba7dd740a3))

## [0.2.3](https://github.com/Strandgaard96/mc-gamertime/compare/v0.2.2...v0.2.3) (2026-10-07)


### Bug Fixes

* **deps:** update dependency pyjwt to v2.15.1 ([361caa7](https://github.com/Strandgaard96/mc-gamertime/commit/361caa7bf0abf93fba5d986d22d3795ef4a57786))

## [0.2.2](https://github.com/Strandgaard96/mc-gamertime/compare/v0.2.1...v0.2.2) (2026-10-07)


### Bug Fixes

* **api:** path containment checks in CodeQL-recognised form ([61d6233](https://github.com/Strandgaard96/mc-gamertime/commit/61d623358bc6e07fd381ed31e1b267ca60d22d97))
* **api:** path containment checks in CodeQL-recognised form ([b82085a](https://github.com/Strandgaard96/mc-gamertime/commit/b82085afb04fe05882eeb949098f3a6695914162))
* **web:** second UI review pass — layout, labels, contrast ([ec65c62](https://github.com/Strandgaard96/mc-gamertime/commit/ec65c62290ed1d2d961e4af8e2dc8366d2f2aaae))
* **web:** strip HTML via DOMParser instead of regex ([70c447f](https://github.com/Strandgaard96/mc-gamertime/commit/70c447f53bb906aa1047ea14e97997a8dbd5256b))

## [0.2.1](https://github.com/Strandgaard96/mc-gamertime/compare/v0.2.0...v0.2.1) (2026-10-07)


### Bug Fixes

* **web:** mobile UI fixes from UI review ([2591e43](https://github.com/Strandgaard96/mc-gamertime/commit/2591e4316f8ab3e77463bc46f5fd8ac00b0a1310))
* **web:** mobile UI fixes from UI review ([e45cc7c](https://github.com/Strandgaard96/mc-gamertime/commit/e45cc7c2b8638a1a53f3d07d757821c90178782d))

## [0.2.0](https://github.com/Strandgaard96/mc-gamertime/compare/v0.1.2...v0.2.0) (2026-10-02)


### Features

* configurable source and docs links on landing page ([acdba91](https://github.com/Strandgaard96/mc-gamertime/commit/acdba91833ade0919140a54d8e468a351cce6319))
* GitHub source button in landing header ([d0f6250](https://github.com/Strandgaard96/mc-gamertime/commit/d0f625008490a9e712fbd18d2b9b7c0fd7d7d69f))
* home page source link follows settings ([ff40013](https://github.com/Strandgaard96/mc-gamertime/commit/ff400138b9ee72fc6d9628adef27c085ecd79d2c))
* home page source link follows settings ([14c4361](https://github.com/Strandgaard96/mc-gamertime/commit/14c4361c9a5b23d1b22454266c33740bcd34a1c4))
* landing header links (configurable) + spacing pass ([3dfadc6](https://github.com/Strandgaard96/mc-gamertime/commit/3dfadc6a9626fdae4070b5656bd55a7c8012c96d))
* landing headline names what the app does ([380b4d6](https://github.com/Strandgaard96/mc-gamertime/commit/380b4d6ffc65e141c3265b6bf8dd95cccef9068b))
* landing page showcase + opt-in project info ([1faba44](https://github.com/Strandgaard96/mc-gamertime/commit/1faba44e1463834beac61023ef62fd14b09b680c))
* landing page showcase + opt-in project info ([7f6b231](https://github.com/Strandgaard96/mc-gamertime/commit/7f6b231f918661915b33251e9b6d654660e006c6))
* plainer landing page copy ([67aa45c](https://github.com/Strandgaard96/mc-gamertime/commit/67aa45c845787ad55249d83a63296e8221ebfa62))
* plainer landing page copy ([e2a2364](https://github.com/Strandgaard96/mc-gamertime/commit/e2a236419ff0b9b88392916e98af39765895a49f))
* rename landing section to Recommendations ([f8b052b](https://github.com/Strandgaard96/mc-gamertime/commit/f8b052bdb177cc43f6bdb8bfde7f17e8b7e2e13f))
* tighter landing spacing, extras under screenshots ([54bb0d2](https://github.com/Strandgaard96/mc-gamertime/commit/54bb0d288e078303da0042c9ea0b31fe47c70bed))
* use instance display name on every page ([eb41cf6](https://github.com/Strandgaard96/mc-gamertime/commit/eb41cf6acc8578fb01cc1bc2a2dcd023fcd30c87))
* use instance display name on every page ([3541c35](https://github.com/Strandgaard96/mc-gamertime/commit/3541c35fb3aeff204821000e23d8bbbc6fcb1b6c))


### Bug Fixes

* bump PyJWT to 2.14.0 and refresh base image for CVEs ([480910a](https://github.com/Strandgaard96/mc-gamertime/commit/480910ac00f62879e8ac4c76ee9a012ade166766))
* bump PyJWT to 2.14.0 and refresh base image for CVEs ([08aa04f](https://github.com/Strandgaard96/mc-gamertime/commit/08aa04fa61bbd6e044b108185625d6637e72fad8))

## [0.1.2](https://github.com/Strandgaard96/mc-gamertime/compare/v0.1.1...v0.1.2) (2026-09-08)


### Bug Fixes

* **compose:** bind published port to 127.0.0.1 by default (APP_BIND) ([26bcec5](https://github.com/Strandgaard96/mc-gamertime/commit/26bcec5f5ad0d79ccc8f6a231c2ac3697b24908b))

## [0.1.1](https://github.com/Strandgaard96/mc-gamertime/compare/v0.1.0...v0.1.1) (2026-09-08)


### Bug Fixes

* **compose:** run app as PUID/PGID and name services mc-gamertime ([b21b698](https://github.com/Strandgaard96/mc-gamertime/commit/b21b698dfbf2ed7916740aef00779b124bbca1d2))

## 0.1.0 (2026-09-08)


### Features

* initial public release ([920fe69](https://github.com/Strandgaard96/mc-gamertime/commit/920fe6963bfc28ac7613d476e515b118f9bef41a))
