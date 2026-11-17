/**
 * 礼炮按钮（`overlay.burst`）的配置模板，按壁纸整块复制进 wallpaper.config.json。
 *
 * 字段        默认          说明
 * kind        spray         confetti 彩带 / spray 喷水 / yogurt 酸奶
 * x / y       0.97 / 0.5    发射点，视口比例 0–1；默认就是「右边居中往内偏 3%」
 * angle       -135          度；0 = 正右、-90 = 正上 → -135（即第二象限）朝左上 45°
 *                           （注意 -45 是右上：wallkit 的弹道用 cos/sin，符号容易反）
 * size        100           粒子尺寸 %（20–300）
 * intensity   100           喷射力度（0–300）：射程 / 高度 / 水柱破碎，不是透明度
 * speed       100           运动节奏 %（20–300）
 * count       0             粒子数 4–400；0 = 用形态自带数量
 * color       ""            空 = 形态固有色（彩带彩虹 / 水蓝 / 乳白）
 *
 * 整块删掉就没有按钮；`"burst": true` 是「全部取默认值」的简写。
 */

const BustConfigTemplate = {
  "overlay": {
    "accent": "#a8c4ff",
    "burst": {
      "kind": "confetti",
      "x": 0.97,
      "y": 0.5,
      "angle": -135,
      "size": 200,
      "intensity": 160,
      "speed": 150,
      "count": 0,
      "color": ""
    }
  }
}