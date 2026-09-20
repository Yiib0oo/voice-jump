# SunnyLand 场景与巡逻动物素材

作者：Luis Zuno / Ansimuz。

- 作者作品主页：https://ansimuz.itch.io/sunny-land-pixel-game-art
- 本次原始包来自作者本人发布的 OpenGameArt 页面：https://opengameart.org/node/74142
- 原始包：https://opengameart.org/sites/default/files/sunny-land-files.zip
- 下载日期：2026-09-20
- 页面标注 CC0；包内原始许可保留为 `public-license.txt`。这里只使用美术，不使用另有署名要求的音乐。

`back.png`、`middle.png`、`tileset.png` 原样复制自 `PNG/environment/layers/`。
其余 PNG 原样复制自 `PNG/environment/props/`。未修改原图；Canvas 按原始像素及图块边界取样，重复铺设背景、地面、平台和地刺。

场景在海天绿野、金色密林和用原始图块拼成的地下矿道之间平滑切换，不再切换四季。`opossum.png` 原样复制自基础包 `PNG/spritesheets/oposum.png`，6帧行走；`slug.png` 原样复制自同作者 SunnyLand Forest 包的 `PNG/spritesheets/enemies/slug.png`，4帧爬行。

2026-09-21 接入 Forest 原始背景：`forest-back.png`、`forest-middle.png`、`forest-tileset.png` 分别原样复制自 Forest 包 `PNG/environment/layers/background.png`、`middleground.png`、`tileset.png`；`forest-tree.png`、`forest-house.png`、`forest-mushroom.png` 分别原样复制自 `PNG/environment/props/tree.png`、`house.png`、`mushroom-red.png`。只做文件重命名，未修改 PNG 像素；地面按16像素图块取样。

- Forest 包作者页面：https://opengameart.org/content/sunnyland-forest
- 原始包：https://opengameart.org/sites/default/files/sunny-land-forest-files.zip
- 页面标注 CC0；包内原始许可保留为 `forest-license.txt`，未使用音乐。

矿道复用 Forest `tileset.png` 中的细岩壁 `(272,112,16,32)`、嵌入式木撑 `(192,96,64,80)`、壁生植物 `(288,112,16,32)`、砖块碎片 `(128,112,16,16)` 和矿灯 `(304,128,16,16)`，以 Canvas 按原始区域取样拼装，像素等比放大2倍。`mine-rock.png`、`mine-vine.png` 原样复制自 Forest 包 `PNG/environment/props/rock.png`、`vine.png`；`mine-crate.png` 为此前保留的基础包木箱，本版矿壁不使用。PNG 未编辑，也没有把用户截图作为背景图片。岩壁与墙面装饰统一按卷轴速度的6%移动；矿灯只有稳定的局部暖光，不绘制另一层洞穴阴影。矿道岩刺仍为代码绘制的像素轮廓。

头像和马里奥人物身体暂未替换；旧动物贴图只作资源加载失败时的后备，其来源与权利说明仍见 `../mario/SOURCES.md`。
