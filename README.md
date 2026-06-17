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
| `src/skill/skills.js` | 技能对象 `lib.skill` 内容 |
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
4. `src/skill/skills.js` 与 `src/translate/skill.js` 写入技能与描述  
5. 放入立绘与（若有）阵亡配音，并更新 `extension.js` 的 `files.character` / `files.audio`

## 添加一张扩展牌

1. `src/card/data.js` + `src/card/translate.js`  
2. `image/card/{牌名键}.jpg`  
3. `extension.js` → `files.card`

## 设计者与来源索引

以下内容按 `src/character/intro.js` 当前写法整理。

### 设计者

- `0^0`：嗔赵云
- `ff`：族谢石
- `pioneer`：文鸯
- `yyuan`：郝普
- `滑溜溜`：石苞、王朗
- `？`：孙秀
- `元徒。`：族谢道韫
- `夏商周在`：族谢安
- `拉普拉斯`：族谢玄
- `钟林`：赵云、曹操、曹植
- `叼五我爱你麻（B站）`：孙绍
- `混乱的啃`：族谢灵运
- `昆世`：sp文鸯
- `杰劼夫长（贴吧）`：孙皎
- `迟眠饱（B站）`：司马乂
- `琉多斯。`：长坂坡赵云
- `寻辉逐烨`：诸葛亮
- `祂不想`：刘墨
- `欢愉与希望`：刘琨
- `熏鱼不爱果子`：钟会（修改）
- `西夏笠谷`：羊徽瑜&王元姬、曹宪&曹华
- `墨客`：魔姜维
- `心乐之`：谋郭淮（修改）

### 来源

- `BV1CDGv6uESF`：姜维
- `BV1Rv7S65EAy`：陆逊


### 未明确标注


