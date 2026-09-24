\##每日SOP

1.产品定位

帮助容易在目标中迷失的人，把：目标→阶段→学习路径→任务→今日SOP→最小动作

最终转化为：“我现在可以马上做什么？”

核心原则：降低启动门槛，不制造焦虑。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

2.技术栈

•	Next.js App Router

•	TypeScript

•	TailwindCSS + shadcn/ui

•	Next.js Route Handlers

•	PostgreSQL + Prisma

•	OpenAI API

•	Vercel

•	Git + GitHub

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

3.MVP页面

底部导航只有：今日|目标|路线|进度

•	/：今日

•	/goals：我的目标

•	/route：路线图

•	/progress：进度

创建/编辑目标从「目标」进入，不单独占底部导航。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

4.核心业务规则

Goal

•	一个用户最多3个activegoals

•	Goal状态：active|paused|completed|deleted

•	删除使用软删除

•	一个Goal可以有多个Stage

•	一个Goal同时只有一个current\_stage

•	暂停Goal后不生成新的SOP

•	恢复Goal前检查activegoals<3

Stage

状态：not\_started→in\_progress→completed

•	一个Goal同时只能有一个in\_progressStage

•	只有当前Stage需要详细配置

•	未来Stage只保存基本信息

•	当前Stage完成后进入下一Stage

•	最终Stage完成后Goal→completed

Learning Path

属于Stage。

字段：

title

type

description

order\_index

source\_type

source\_type：

user|ai

Task

属于Stage，可关联LearningPath。

状态：

pending↔completed

字段：

title

description

estimated\_minutes

order\_index

status

Daily SOP

属于：

user+goal+stage+date

同一个Goal同一天只能有一个SOP。

状态：

pending|completed

Minimum Action

•	每个用户每天只有1个全局最小动作

•	必须来自当天已有Task

•	必须立即可执行

•	不得创建新Task

•	最小动作完成后不自动生成第二个

•	minimum\_action.completed不等于daily\_sop.completed

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

5.多目标逻辑

最多同时：Goal A、Goal B、Goal C

每个active Goal有自己的Daily SOP。

首页把所有Goal的今日任务聚合展示。

但全局只有：1个今日最小动作

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

6.四个页面职责

今日

回答：今天做什么？现在第一步做什么？

读取：

today SOP

today tasks

global minimum action

目标

管理：Goals、Stages、Learning Path

路线

展示：completed、in\_progress、not\_started

只读数据库，不调用 AI。

进度

计算：completed tasks/total tasks

只读数据库，不调用 AI。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

7.数据库

核心表：

users

goals

stages

learning\_paths

tasks

daily\_sops

daily\_sop\_tasks

minimum\_actions

daily\_minimum\_actions

prompt\_configs

ai\_generation\_logs

核心关系：

users

&#x20;└─ goals

&#x20;    └─ stages

&#x20;        ├─ learning\_paths

&#x20;        └─ tasks

goals

&#x20;└─ daily\_sops

&#x20;    ├─ daily\_sop\_tasks → tasks

&#x20;    └─ minimum\_actions → tasks

users

&#x20;└─ daily\_minimum\_actions → minimum\_actions

关键ID：

goal.current\_stage\_id

stage.goal\_id

task.stage\_id

learning\_path.stage\_id

daily\_sop.goal\_id

daily\_sop.stage\_id

daily\_sop\_task.task\_id

minimum\_action.task\_id

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

8.API

Goals

GET    /api/goals

POST   /api/goals

GET    /api/goals/:goalId

PATCH  /api/goals/:goalId

DELETE /api/goals/:goalId

POST   /api/goals/:goalId/pause

POST   /api/goals/:goalId/resume

Stages

GET    /api/goals/:goalId/stages

POST   /api/goals/:goalId/stages

PATCH  /api/stages/:stageId

DELETE /api/stages/:stageId

POST   /api/stages/:stageId/complete

Tasks

POST /api/tasks/:taskId/complete

POST /api/tasks/:taskId/uncomplete

Daily SOP

GET  /api/today

GET  /api/daily-sops/:date

POST /api/daily-sops/:sopId/complete

Route / Progress

GET /api/goals/:goalId/route

GET /api/goals/:goalId/progress

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

9\. AI API

POST /api/ai/goal/parse

POST /api/ai/stages/generate

POST /api/ai/learning-path/generate

POST /api/ai/tasks/generate

POST /api/ai/daily-sop/generate

POST /api/ai/minimum-action/generate

AI负责：理解、整理、生成

AI不负责：CRUD、完成状态暂停/恢复、阶段推进、删除、进度计算

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

10.AI调用规则

Goal Parser用户创建/整理Goal时调用。

Stage Generator创建Goal后生成Stage候选。

Learning Path Organizer用户提交当前Stage的学习路径时调用。

Task Decomposer当前Stage的Learning Path确认后调用。

Daily SOP Generator当前Stage需要生成Daily SOP时调用。

Minimum Action Generator当天不存在Global Minimum Action时调用。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

11.AI数据流程

所有AI必须：

读取Prompt Config→ 构造Input→OpenAI→JSON Parse→ Schema Validation→ 成功后保存/返回

失败：

Retry 1 次→仍失败→写入ai\_generation\_logs→返回错误

AI输出未经Schema Validation不得进入数据库。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

12.Prompt

Prompt集中管理：

/prompts

&#x20; /goal

&#x20; /stage

&#x20; /learning-path

&#x20; /task

&#x20; /daily-sop

&#x20; /minimum-action

Prompt必须包含：

prompt\_id

version

system\_prompt

input\_schema

output\_schema

rules

Frontend 不得自行解释或补充AI缺失字段。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

13\. 当前Stage机制

创建Goal：

Goal

&#x20;↓

多个 Stage

&#x20;↓

选择/确定当前 Stage

&#x20;↓

只配置当前 Stage

当前 Stage：

Learning Path

&#x20;↓

Tasks

&#x20;↓

Daily SOP

当前 Stage 完成：

Next Stage

&#x20;↓

重新配置 Learning Path

&#x20;↓

Tasks

&#x20;↓

Daily SOP

避免一次性规划整个长期目标。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

14.当前目标绑定

路线和进度必须绑定goalId：

/route?goalId=xxx

/progress?goalId=xxx

前端可用localStorage保存最近选择的Goal。

不得出现路线/进度显示错误Goal的情况。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

15.开发约束

Claude Code 必须：

1\.	严格遵守本文件。

2\.	不自行增加MVP功能。

3\.	不擅自修改数据库关系。

4\.	不擅自修改API Contract。

5\.	不擅自修改状态机。

6\.	不把Prompt写死在页面组件中。

7\.	Route/Progress不调用 AI。

8\.	AI不直接修改业务状态。

9\.	数据库是真实状态来源。

10\.	发现规格冲突时先指出，不自行决定。

11\.	每完成一个模块先运行、测试、再继续。

12\.	不一次性重构整个项目。

\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_

16.MVP完成标准

完整跑通：

创建Goal

→ AI 整理

→ 用户确认

→ 生成 Stage

→ 用户确认

→ 配置当前 Stage

→ Learning Path

→ Tasks

→ Daily SOP

→ 今日最小动作

→ 完成 Task

→ 查看进度

→ 查看路线

→ 完成 Stage

→ 下一 Stage

→ 最终 Goal completed

只要以上链路稳定跑通，MVP 即完成。



