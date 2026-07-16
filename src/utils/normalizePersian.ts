export const normalizePersian = (value: string): string =>
  value
    .normalize('NFC')
    .replaceAll('ي', 'ی')
    .replaceAll('ى', 'ی')
    .replaceAll('ك', 'ک')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\r\n?/gu, '\n')
    .trim();

export const hasArabicLetterVariants = (value: string): boolean => /[يك]/u.test(value);
