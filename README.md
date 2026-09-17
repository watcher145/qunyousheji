# 群友设计（模块化扩展）
一个很简陋的无名杀扩展，大量武将没有配图，没有语音，而且都是搜集来的，我自己想玩。
结构与 **`extension/奇臣传`** 对齐，便于只改数据与技能、不动入口装配逻辑。
搜集设计，然后做出来玩玩，有意见可以提出

## 目录说明

| 路径 | 作用 |
|------|------|
| `extension.js` | 扩展入口，引用 `src/package.js`、`src/precontent.js`；`arenaReady` 里挂 `setupCharacterReplace()` |
| `info.json` | 扩展元信息（名称 / 作者 / 简介） |
| `src/package.js` | 组装 `character` / `card` / `skill` 三块并合并进无名杀 `package`；`characterSort` 包、`characterSortTranslate`、`pkgPrefixMap` 都在这里 |
| `src/precontent.js` | 加载时逻辑：注册 `lib.namePrefix` 自定义前缀样式、合并 `lib.dynamicTranslate` |
| `src/character/data.js` | 武将：`{ sex, group, doubleGroup?, hp, maxHp, hujia, skills }`（双势力用 `doubleGroup` 数组，主势力排第一） |
| `src/character/translate.js` | 武将译名、`id_prefix`、卡包名等 |
| `src/character/title.js` | 武将称号 `characterTitle` |
| `src/character/intro.js` | 武将简介 `characterIntro`（`设计：`/`来源：` 字段供本 README 索引解析） |
| `src/character/patchAssets.js` | 自动写 `img`、`dieAudios` 路径（本扩展目录） |
| `src/character/replace.js` | 角色替换表：与本体同名武将在选将界面互切（`lib.characterReplace`） |
| `src/card/data.js` | 扩展卡牌定义 |
| `src/card/translate.js` | 卡牌名与 `*_info` |
| `src/card/patchAssets.js` | 卡牌插画 `ext:群友设计/image/card/...` |
| `src/skill/index.js` | 合并 5 个技能文件为 `lib.skill` |
| `src/skill/helpers.js` | 技能工具函数（跨技能共用逻辑，如 `qunyou_no1Player`） |
| `src/skill/yachai.js` | 崖柴系技能 (`yachai_*`) |
| `src/skill/clan.js` | 宗族技 (`clan*`) |
| `src/skill/qunsai.js` | 群赛技能：`shanhe_*` / `zishu_*` / `maokuo_*` / `zhuoming_*` / `qiufeng_*` / `wending_*` / `threed_*` / `xingyu_*` |
| `src/skill/xiaobai.js` | 小白杯技能（`xiaobai_*`，含 `lib.xiaobai*` 辅助函数） |
| `src/skill/sanshe.js` | 散设技能：`qunyou_*` / `xuandie_*`（含 `qunyouPhaseNames`，被 dynamicTranslate 引用） |
| `src/translate/skill.js` | 技能译名**汇总入口**：展开合并下列按前缀拆分的译名文件，新增前缀文件时在这里补 import |
| `src/translate/qunyou.js` | `qunyou_*`（散设）技能译名与 `*_info` |
| `src/translate/clan.js` / `yachai.js` | `clan*` 宗族技 / 崖柴系技能译名 |
| `src/translate/{qiufeng,threed,xiaobai,zishu,zhuoming,shanhe,xuandie,maokuo，wending}.js` | 对应来源前缀（秋风 / 3D / 小白 / 自书 / 濯名 / 山河 / 玄蝶 / 猫扩 / 问鼎）的技能译名 |
| `src/translate/misc.js` | 杂项（自定义标签译名，如 `daozhi_tag`） |
| `src/translate/dynamicTranslate.js` | 局内动态描述（由 `precontent.js` 合并进 `lib.dynamicTranslate`） |
| `test/` | 开发自检与检索工具：`skill-test.mjs`（运行时回归）、`dupkey-scan.mjs`（重复键结构自查）、`skill-search.mjs`（语义检索）等，用法见 `test/自检指南.md`；场景语料与 embedding 缓存/训练脚本也在此 |
| `tools/角色添加器/` | 本地网页小工具：填表自动写五个注册文件（写前备份、写后 `node --check`），支持双势力/前缀/选包，详见其目录内 README |
| `tools/update-readme.mjs` | 重新生成本文件「设计者与来源索引」章节（双击 `更新readme.bat`），标记之前的手写内容不动 |
| `tools/skill-prefix-stat.mjs` | 统计 `src/skill/*.js` 各自包含哪些前缀的技能（核对「按前缀分文件」的约定是否被破坏） |

> 注：`src/skill/skills.js.bak` 是拆分前的历史备份，勿引用、勿写入。

## 资源文件

- 武将立绘：`image/character/{武将id}.jpg`
- 阵亡：`audio/die/{武将id}.mp3`
- 卡牌图：`image/card/{卡牌键名}.jpg`

在 **`extension.js` → `files`** 中登记用到的图片/音频文件名后，打包/联机更稳妥。

## 添加一名武将（ checklist ）

> 也可以直接用 `tools/角色添加器` 填表自动写前 4 步（写前备份、写后语法检查）。

1. `src/character/data.js` 增加 id 与 `skills` 数组（双势力写 `doubleGroup: ["主", "副"]`）  
2. `src/character/translate.js` 增加译名（及可选 `id_prefix`）  
3. `title.js` / `intro.js` 按需补充（`intro` 里的 `设计：` 字段会被 README 索引解析）  
4. 技能按组别写入 `src/skill/{yachai,clan,qunsai,sanshe,xiaobai}.js`；译名写入**该前缀对应的** `src/translate/*.js`（如 `qunyou_*` → `qunyou.js`、`maokuo_*` → `maokuo.js`、`xiaobai_*` → `xiaobai.js`；`skill.js` 只做汇总）  
5. 放入立绘与（若有）阵亡配音，并更新 `extension.js` 的 `files.character` / `files.audio`  
6. 跑一遍自检：`node test/skill-test.mjs` 与 `node test/dupkey-scan.mjs`（解读见 `test/自检指南.md`）

## 添加一张扩展牌

1. `src/card/data.js` + `src/card/translate.js`  
2. `image/card/{牌名键}.jpg`  
3. `extension.js` → `files.card`

## 设计者与来源索引

### 3D吧赛
- `白驹`：3D董白（修改）
- `柠檬`：3D何姬

### 秋风杯
- `门冬`：秋风张琪瑛（修改）
- `老酒馆的猫`：秋风胡氏（修改）
- `夜已央`：夏侯徽（修改）

### 小白杯
- `小叶子`：小白李昭仪、小白绿珠（修改）
- `why do we fall`：小白李特
- `可余雪`：小白索靖
- `铝`：小白胡芳
- `易大剧`：小白马伦（修改）
- `小白杯主办组`：小白赵爽
- `超绝天`：小白谌母
- `老酒馆的猫`：小白高定
- `夜已央`：小白刘颂
- `嘭！`：小白张臶
- `食马者`：小白申仪
- `雨幕江南`：小白鲍勋
- `cyc`：小白程喜

### 自书杯
- `城北徐公`：自书李严
- `环己醇`：自书吕据、自书王瓘、自书毛皇后
- `天任`：自书荀彧
- `柠檬`：自书孙和
- `固障机器人`：自书张瑾云
- `yyuan`：自书潘淑、自书谷利
- `小涵`：自书臧霸
- `..`：自书段颎
- `朱苦力`：自书山涛
- `此方`：自书雍闿
- `易大剧`：自书梁习

### 濯名杯
- `梦揽星河`：濯名飞戾公孙渊、濯名烽起马腾
- `终结者一号`：濯名公孙渊
- `可余雪`：濯名刘焉
- `孝文白王`：濯名马腾
- `伊藤幸子`：濯名朔骋马腾（修改）
- `我来天地正秋风`：濯名梦董卓（修改）

### 问鼎•陈郡谢氏
- `未知`：族谢道韫
- `夏商周在`：族谢安
- `拉普拉斯`：族谢玄
- `混乱的啃`：族谢灵运
- `ff`：族谢石

### 山河如梦
- `玖宴`：朔张角、梦董卓（修改）
- `江雪埋骨`：朔韩馥、弦鲁肃（修改）
- `魁梧影`：朔卢植
- `o.O`：晦姜维
- `颜渊&江雪`：弦王异
- `XX`：山河马良

### 星玉扩展
- `志文`：星玉孙尚香（修改）

### 崖柴的族武将设
- `崖柴xxxF（B站）`：族崔琰、族王祥、族貂蝉、族吴懿、族荀彧
- `崖柴xxxF（B站）`：族陆逊、族陆抗、族陆绩、族陆云、族陆机、族陆郁生、族陆凯
- `崖柴xxxF（B站）`：族诸葛亮、族诸葛瞻、族诸葛尚、族诸葛瑾、族诸葛恪、族诸葛诞、族诸葛靓

### 西夏笠谷
- `西夏笠谷`：羊徽瑜&王元姬、曹宪&曹华、西夏孙策、吕玲绮、潘濬

### 玄蝶的设计
- `玄蝶`：荀灌、蝶设吕雉、蝶设卓文君、蝶设祖逖

### 猫咪大院
- `RP`：猫咪曹不兴
- `怀默`：猫咪神姜维、猫咪怒麒·姜维
- `冥狐`：猫咪彭羕
- `陈木`：猫咪王桃&王悦

### 收集到的好设
- `pioneer`：文鸯
- `滑溜溜`：石苞、董卓、诸葛果
- `？`：孙秀
- `钟林`：赵云、曹植、郭嘉
- `叼五我爱你麻（B站）`：孙绍
- `昆世`：sp文鸯
- `欢愉与希望`：刘琨、赵爽、族袁隗
- `迟眠饱（B站）`：司马乂
- `杰劼夫长(贴吧）`：孙皎
- `yyuan`：郝普
- `0^0`：嗔赵云
- `罗乐省标9191（B站）`：谋诸葛亮
- `祂不想`：刘墨
- `未知`：梦刘封
- `嘻˘꒳˘羲`：曹爽
- `墨客`：魔姜维
- `心乐之`：谋郭淮
- `来自大宝规则集中宗族技的例子`：族貂蝉
- `忆否白露（B站）`：威关羽
- `终汐舷`：张燕
- `寻辉逐烨`：周瑜
- `阿桔是我`：太史慈、费祎
- `烦不烦（B站）`：郭图
- `-黎明-Dawn（B站）`：刘谌
- `小白大白小黑大嘿`：马谡
- `璐璐`：族王戎
- `BCG&颍川李氏`：族袁谭&袁尚、族袁绍
- `可余雪`：阳群
- `monika&于吉`：族貂蝉
- `烦不烦吵死了`：族孔愉
- `静谦`：族王浚

### 收集到的好设，但只有来源
- `BV1Rv7S65EAy`：陆逊
- `BV12N9gBMEW2`：王允
- `BV12Y8B6FE3n`：关羽
- `BV1nmK26EEr3`：族诸葛均
- `BV1r53b61Ep1`：钟进

### 改设和补设
#有些设计由于存在强度问题或技能逻辑需要修改或补充，特此列出，欢迎提出意见
- `钟林`：曹操（修改：欢愉与希望）
- `琉多斯`：长坂坡赵云（修改：欢愉与希望）
- `佐世保之时雨 && 欢愉与希望（补设）`：韩氏五虎
- `熏鱼不爱果子`：钟会（修改：欢愉与希望）
- `晴`：武张飞（修改：欢愉与希望）
- `三天内炸白宫（B站）&& 欢愉与希望（补设）`：吕壹
- `罗晓翳不是海龟螺猫（B站）&& 欢愉与希望（补设）`：孙策
- `此方`：族荀颛（修改：欢愉与希望）
- `BCG&颍川李氏`：族袁术（修改：欢愉与希望）
- `于吉&颖川李氏`：族姜维（修改：欢愉与希望）
- `余平方`：陶侃（修改：欢愉与希望）
- `搞电信诈骗的`：贾南风（修改：欢愉与希望）
- `badlunar`：孙皓（修改：欢愉与希望）
- `砖`：魔王允（修改：欢愉与希望）

### 能永动的武将
- `滑溜溜`：王朗

### 有问题的设计
- `BV1CDGv6uESF`：姜维
- `鹭`：剻越
