# 群友设计（模块化扩展）

结构与 **`extension/奇臣传`** 对齐，便于只改数据与技能、不动入口装配逻辑。

## 目录说明

| 路径 | 作用 |
|------|------|
| `extension.js` | 扩展入口，引用 `src/package.js`、`src/precontent.js` |
| `src/package.js` | 组装 `character` / `card` / `skill` 三块并合并进无名杀 `package` |
| `src/precontent.js` | 加载时逻辑（如 `lib.dynamicTranslate`） |
| `src/character/data.js` | 武将：`{ id: { sex, group, hp, maxHp, hujia, skills } }` |
| `src/character/translate.js` | 武将译名、卡包名等 |
| `src/character/title.js` | 武将称号 `characterTitle` |
| `src/character/intro.js` | 武将简介 `characterIntro` |
| `src/character/patchAssets.js` | 自动写 `img`、`dieAudios` 路径（本扩展目录） |
| `src/card/data.js` | 扩展卡牌定义 |
| `src/card/translate.js` | 卡牌名与 `*_info` |
| `src/card/patchAssets.js` | 卡牌插画 `ext:群友设计/image/card/...` |
| `src/skill/index.js` | 合并 4 个技能文件为 `lib.skill` |
| `src/skill/helpers.js` | 技能工具函数 |
| `src/skill/yachai.js` | 崖柴系技能 (`yachai_*`) |
| `src/skill/clan.js` | 宗族技 (`clan*`) |
| `src/skill/qunsai.js` | 群赛（目前有：自书杯 + 问鼎·陈郡谢氏 + 山河如梦·朔） 技能 |
| `src/skill/sanshe.js` | 散设 — 其余 `qunyou_*` 技能 |
| `src/translate/skill.js` | 技能译名与 `*_info` |
| `src/translate/dynamicTranslate.js` | 局内动态描述（可选） |

## 资源文件

- 武将立绘：`image/character/{武将id}.jpg`
- 阵亡：`audio/die/{武将id}.mp3`
- 卡牌图：`image/card/{卡牌键名}.jpg`

在 **`extension.js` → `files`** 中登记用到的图片/音频文件名后，打包/联机更稳妥。

## 添加一名武将（ checklist ）

1. `src/character/data.js` 增加 id 与 `skills` 数组  
2. `src/character/translate.js` 增加译名（及可选 `id_prefix`）  
3. `title.js` / `intro.js` 按需补充  
4. 根据技能所属组别写入 `src/skill/{yachai,clan,qunsai,sanshe}.js`，译名写入 `src/translate/skill.js`  
5. 放入立绘与（若有）阵亡配音，并更新 `extension.js` 的 `files.character` / `files.audio`

## 添加一张扩展牌

1. `src/card/data.js` + `src/card/translate.js`  
2. `image/card/{牌名键}.jpg`  
3. `extension.js` → `files.card`

## 设计者与来源索引

以下内容按 `src/character/intro.js` 当前写法整理。

### 设计者

## 自书杯
- `城北徐公`：李严
- `环己醇`：王瓘、吕据
- `城北徐公`：荀彧
## 问鼎•陈郡谢氏 
- `ff`：族谢石
- `元徒。`：族谢道韫
- `夏商周在`：族谢安
- `拉普拉斯`：族谢玄
- `混乱的啃`：族谢灵运
## 山河如梦•朔  
- `玖宴`：朔张角、梦董卓
- `魁梧影`：朔卢植
## 崖柴的族武将设计
- `崖柴xxxF（B站）`：族崔琰、族王祥、族貂蝉、族吴懿、族荀彧
- `崖柴xxxF（B站）`: 族陆逊、族陆抗、族陆机、族陆云、族陆绩、族陆凯、族陆郁生
- `崖柴xxxF（B站）`: 族诸葛亮、族诸葛瞻、族诸葛瑾、族诸葛恪、族诸葛诞、族诸葛靓
## 西夏笠谷的设计
- `西夏笠谷`：羊徽瑜&王元姬、曹宪&曹华、孙策、吕玲绮
## 收集到的好设
- `0^0`：嗔赵云
- `pioneer`：文鸯
- `yyuan`：郝普
- `滑溜溜`：石苞、王朗（永动）
- `？`：孙秀
- `钟林`：赵云、曹操（修改）、曹植
- `叼五我爱你麻（B站）`：孙绍
- `昆世`：sp文鸯
- `杰劼夫长（贴吧）`：孙皎
- `迟眠饱（B站）`：司马乂
- `祂不想`：刘墨
- `欢愉与希望`：刘琨
- `墨客`：魔姜维
- `心乐之`：谋郭淮
- `终汐舷`：张燕
- `寻辉逐烨`：周瑜
- `忆否白露（B站）`：威关羽

## 收集到的好设，但只有来源
- `BV1CDGv6uESF`：姜维
- `BV1Rv7S65EAy`：陆逊
- `大宝规则集`：族貂蝉（宝集里的）
- `BV12N9gBMEW2`：王允

## 改设和补设
#有些设计由于存在边界问题或技能逻辑需要修改或补充，特此列出，欢迎提出意见
- `熏鱼不爱果子`：钟会（修改：欢愉与希望）
- `三天内炸白宫（B站）`：吕壹（补充和修改：欢愉与希望）
- `琉多斯`：长坂坡赵云（修改：欢愉与希望）

## 需要改进的设计
- `晴`：武张飞->大概率永动的
- `寻辉逐烨`：谋诸葛亮->操作繁琐的

