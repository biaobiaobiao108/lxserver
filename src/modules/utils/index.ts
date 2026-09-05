import crypto from 'node:crypto'

export const toMD5 = (str: string): string => crypto.createHash('md5').update(str).digest('hex')

export const sizeFormate = (size: number): string => {
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const number = Math.floor(Math.log(size) / Math.log(1024))
  return `${(size / Math.pow(1024, Math.floor(number))).toFixed(2)} ${units[number]}`
}

const numFix = (n: number): string => (n < 10 ? `0${n}` : n.toString())

// Basic HTML entity decode for Node.js
export const decodeName = (str: string): string => {
  if (!str) return ''
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
  }
  return str.replace(/&[a-zA-Z]+;/g, match => entities[match] || match)
}

/**
 * 格式化播放时间
 */
export const formatPlayTime = (time: number): string => {
  const m = Math.trunc(time / 60)
  const s = Math.trunc(time % 60)
  return m === 0 && s === 0 ? '--/--' : `${numFix(m)}:${numFix(s)}`
}

export const dateFormat = (_date: Date | string | number, format = 'Y-M-D h:m:s'): string => {
  const date = new Date(_date)
  if (isNaN(date.getTime())) return ''
  return format
    .replace('Y', date.getFullYear().toString())
    .replace('M', numFix(date.getMonth() + 1))
    .replace('D', numFix(date.getDate()))
    .replace('h', numFix(date.getHours()))
    .replace('m', numFix(date.getMinutes()))
    .replace('s', numFix(date.getSeconds()))
}

/**
 * 格式化相对时间
 */
export const dateFormat2 = (time: number): string => {
  const differ = Math.trunc((Date.now() - time) / 1000)
  if (differ < 60) {
    return `${differ}秒前`
  } else if (differ < 3600) {
    return `${Math.trunc(differ / 60)}分钟前`
  } else if (differ < 86400) {
    return `${Math.trunc(differ / 3600)}小时前`
  } else {
    return dateFormat(time)
  }
}

export const formatPlayCount = (num: number): string | number => {
  if (num > 100000000) return `${Math.floor(num / 10000000) / 10}亿`
  if (num > 10000) return `${Math.floor(num / 1000) / 10}万`
  return num
}
