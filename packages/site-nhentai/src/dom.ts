export function positiveInteger(value: string | null | undefined): number {
  const number = Number(value?.trim().replace(/,/g, ''))
  return Number.isSafeInteger(number) && number > 0 ? number : 0
}
