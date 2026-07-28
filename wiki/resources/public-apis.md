---
title: public-apis/public-apis — GitHub 最大公益 API 仓库
domain: [resources]
type: entity
status: active
date: 2026-07-25
tags: [api, public-api, open-source, learning, reference, http]
related: [wiki/kb-system/query-workflow]
use_count: 2
---


## 简介

[public-apis/public-apis](https://github.com/public-apis/public-apis) 是 GitHub 上**最大的公益 API 索引仓库**，收录来自全球开发者的免费/公开 REST API。截至 2026-07，仓库 README 已达 221KB，覆盖 40+ 个一级分类，每个 API 标注「认证方式（No/API key/OAuth）」「HTTPS 支持」「CORS 支持」「链接」，是开发原型、学习 HTTP/REST 实践、扩展工具链的首选 API 字典。

⚠️ **重要提示**：仓库 README 顶部置顶 [APILayer Unified Suite](https://apilayer.com/) 商业广告，由 APILayer 团队维护（部分商业 API 引流），使用时注意区分「免费 public API」与「APILayer 商业 API」。

> **领域归属**：本页原属 `wiki/coding/`，按 ADR-009 决策 2 迁移至 `wiki/resources/`。public-apis 是外部资源索引而非编程知识，归类至 resources 领域更准确。

## 核心特点

- **40+ 一级分类**：从 Animals、Anime 到 Government、Transportation，覆盖几乎所有领域
- **统一字段标注**：每个 API 标注四要素，便于筛选：
  - **Auth**：`No` / `apiKey` / `OAuth`
  - **HTTPS**：`Yes` / `No`
  - **CORS**：`Yes` / `No` / `Unknown`
  - **Link**：API 文档地址
- **Markdown 表格组织**：纯 markdown，便于 grep/awk 批量筛选
- **社区驱动收录**：PR 机制收录新 API，无审核费用
- **零代码依赖**：纯文档，不是 SDK，需自行用 fetch/axios 调用

## 分类覆盖（节选）

完整分类见 [README](https://github.com/public-apis/public-apis/blob/master/README.md)，典型分类：

- **Animals**：Cat API、Dog API 等
- **Anime**：Jikan、Studio Ghibli 等
- **Anti-Malware**：VirusTotal、Google Safe Browsing 等
- **Art & Design**：Behance、Harvard Art Museums 等
- **Books**：Open Library、Google Books 等
- **Business**：City APIs、PullString 等
- **Calendar**：Holidays、Hebrew Calendar 等
- **Cloud Storage & File Sharing**：Box、Dropbox 等
- **Continuous Integration**：CircleCI、Travis CI 等
- **Cryptocurrency**：Binance、CoinGecko、CryptoCompare 等
- **Currency Exchange**：fixer、Frankfurter 等
- **Data Validation**：PurgeMatrix、NumValidate 等
- **Development**：GitHub、GitLab、Stack Exchange 等
- **Dictionaries**：Wiktionary、Free Dictionary 等
- **Documents & Productivity**：Etherpad、Todoist 等
- **Environment**：OpenAQ、PM2.5 等
- **Events**：Eventbrite、Meetup 等
- **Finance**：Alpha Vantage、IEX Cloud 等
- **Food & Drink**：Open Food Facts、TheMealDB 等
- **Games & Comics**：Riot Games、Pokemon API 等
- **Geocoding**：Google Maps、OpenStreetMap 等
- **Government**：US Census、Data.gov 等
- **Health**：NHS、COVID-19 等
- **Jobs**：Adzuna、The Muse 等
- **Machine Learning**：Wit.ai、Dialogflow 等
- **Music**：Spotify、Deezer 等
- **News**：NewsAPI、Currents 等
- **Open Data**：Wikipedia、Wikidata 等
- **Open Source Projects**：Drupal.org、Evil Insult Generator 等
- **Patent**：PatentsView、USPTO 等
- **Personality**：Quotes、Advice Slip 等
- **Phone**：Numverify、Twilio Lookup 等
- **Photography**：Flickr、Pixabay 等
- **Programming**：Codeforces、Judge0 等
- **Science & Math**：NASA、SpaceX 等
- **Security**：Have I Been Pwned 等
- **Shopping**：eBay 等
- **Social**：Discord、Telegram 等
- **Sports & Fitness**：API-FOOTBALL、FitBit 等
- **Test Data**：Bacon Ipsum、RandomUser 等
- **Text Analysis**：Lectools、Watson 等
- **Tracking**：UPS、FedEx 等
- **Transportation**：BC Ferries、Izi Data 等
- **URL Shorteners**：Bitly、Rebrandly 等
- **Vehicle**：NHTSA 等
- **Video**：YouTube、Twitch 等
- **Weather**：OpenWeatherMap、Weatherbit 等

## 使用建议

### 学习用途

- **REST API 实践首选**：选 `Auth: No` + `CORS: Yes` 的 API 练习 fetch/axios，免注册即调通
- **HTTP 协议训练**：通过 GET/POST/PUT/DELETE 调用学习 HTTP 方法语义
- **认证方式对比**：选不同 `Auth` 类型的 API，对比 `No` / `apiKey`（query/header） / `OAuth` 三种流程
- **API 设计参考**：通过对比多个同类 API，学习/批判 API 设计

### 开发用途

- **原型开发**：需要外部数据源（天气、汇率、新闻）的 PoC 项目可快速找到 API
- **避免误区**：
  - 免费不等于无配额，多数 API 有 rate limit（如 1000 次/天），生产前确认配额
  - 部分商业 API 引流到 APILayer 付费版，仔细甄别
  - **密钥保护**：API key 必须放 `.env`，禁止硬编码，参见 [[wiki/coding/experiences/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理]]
  - **HTTPS 强制**：选 `HTTPS: Yes` 的 API，避免明文传 API key

### 筛选技巧

```bash
# 找无需认证且支持 CORS 的 API（最易上手）
grep -E "No.*Yes.*Yes" README.md

# 找所有天气 API
sed -n '/### Weather/,/### /p' README.md

# 统计各分类数量
grep -c "^| " README.md
```

## 元数据

| 项 | 值 |
| --- | --- |
| 仓库 | <https://github.com/public-apis/public-apis> |
| 默认分支 | master |
| 维护方 | APILayer 团队 |
| License | MIT（以仓库根 LICENSE 文件为准） |
| README 大小 | 221KB+ |
| 一级分类数 | 40+ |
| 字段标注 | Auth、HTTPS、CORS、Link |
| 商业关联 | APILayer Unified Suite（付费） |
| 增长方式 | 社区 PR 收录 |

## 相关页面

- [[wiki/kb-system/query-workflow]] — 知识库查询工作流（public-apis 可作为外部数据源）
- [[wiki/coding/thealgorithms-python]] — Python 算法实现（调用 public-apis 实践 HTTP）
- [[wiki/coding/experiences/lychee-链接检查-ci绝对路径node-modules-引用与裸-url-的处理]] — 处理外部 URL 的 CI 经验
