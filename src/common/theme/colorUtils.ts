/**
 * Blend color (Lighten or Darken)
 * @param p 混合百分比 范围 0.0 - 1.0
 * @param c0 rgb(a) color1
 * @param c1 rgb(a) color2
 */
export const RGB_Linear_Blend = (p: number, c0: string, c1: string): string => {
  const i = parseInt
  const r = Math.round
  const P = 1 - p
  const [a, b, c, d] = c0.split(',')
  const [e, f, g, h] = c1.split(',')
  const x = d || h
  const j = x ? ',' + (!d ? h : !h ? d : r((parseFloat(d) * P + parseFloat(h) * p) * 1000) / 1000 + ')') : ')'
  return 'rgb' + (x ? 'a(' : '(') + r(i(a[3] === 'a' ? a.slice(5) : a.slice(4)) * P + i(e[3] === 'a' ? e.slice(5) : e.slice(4)) * p) + ',' + r(i(b) * P + i(f) * p) + ',' + r(i(c) * P + i(g) * p) + j
}

/**
 * Blend color (Lighten or Darken)
 * @param p 混合百分比 范围 0.0 - 1.0
 * @param c0 rgb(a) color1
 * @param c1 rgb(a) color2
 */
export const RGB_Log_Blend = (p: number, c0: string, c1: string): string => {
  const i = parseInt
  const r = Math.round
  const P = 1 - p
  const [a, b, c, d] = c0.split(',')
  const [e, f, g, h] = c1.split(',')
  const x = d || h
  const j = x ? ',' + (!d ? h : !h ? d : r((parseFloat(d) * P + parseFloat(h) * p) * 1000) / 1000 + ')') : ')'
  return 'rgb' + (x ? 'a(' : '(') + r((P * i(a[3] === 'a' ? a.slice(5) : a.slice(4)) ** 2 + p * i(e[3] === 'a' ? e.slice(5) : e.slice(4)) ** 2) ** 0.5) + ',' + r((P * i(b) ** 2 + p * i(f) ** 2) ** 0.5) + ',' + r((P * i(c) ** 2 + p * i(g) ** 2) ** 0.5) + j
}

/**
 * Shade color (Lighten or Darken)
 * @param p Shade 百分比范围为 -1.0 - 1.0 负为黑色，正为白色
 * @param c0 rgb(a) color
 */
export const RGB_Linear_Shade = (p: number, c0: string): string => {
  const i = parseInt
  const r = Math.round
  const [a, b, c, d] = c0.split(',')
  const n = p < 0
  const t = n ? 0 : 255 * p
  const P = n ? 1 + p : 1 - p
  return 'rgb' + (d ? 'a(' : '(') + r(i(a[3] === 'a' ? a.slice(5) : a.slice(4)) * P + t) + ',' + r(i(b) * P + t) + ',' + r(i(c) * P + t) + (d ? ',' + d : ')')
}

/**
 * Shade color (Lighten or Darken)
 * @param p Shade 百分比范围为 -1.0 - 1.0 负为黑色，正为白色
 * @param c0 rgb(a) color
 */
export const RGB_Log_Shade = (p: number, c0: string): string => {
  const i = parseInt
  const r = Math.round
  const [a, b, c, d] = c0.split(',')
  const n = p < 0
  const t = n ? 0 : p * 255 ** 2
  const P = n ? 1 + p : 1 - p
  return 'rgb' + (d ? 'a(' : '(') + r((P * i(a[3] === 'a' ? a.slice(5) : a.slice(4)) ** 2 + t) ** 0.5) + ',' + r((P * i(b) ** 2 + t) ** 0.5) + ',' + r((P * i(c) ** 2 + t) ** 0.5) + (d ? ',' + d : ')')
}

/**
 * 修改透明度
 * @param p 透明度 -1.0 - 1.0
 * @param color rgb(a) 格式
 */
export const RGB_Alpha_Shade = (p: number, color: string): string => {
  const i = parseInt
  const n = p < 0
  let [r, g, b, aStr] = color.split(',')
  r = r[3] === 'a' ? r.slice(5) : r.slice(4)
  let a: number
  if (aStr) {
    a = parseFloat(aStr)
    a = a - (n ? (1 - a) * p : a * p)
    a = n ? Math.max(0, a) : Math.min(1, a)
  } else {
    a = 1 - p
    a = Math.min(1, a)
  }
  return `rgba(${i(r, 10)}, ${i(g, 10)}, ${i(b, 10)}, ${a.toFixed(2)})`
}
