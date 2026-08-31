export function uniquePrinterEmails(values: Array<string | undefined>) {
  return [...new Set(values
    .flatMap((value) => String(value || '').split(/[,;\n]/))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => /^\S+@\S+\.\S+$/.test(value)))]
}
