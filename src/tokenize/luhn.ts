export const luhnCheck = (pan: string): boolean => {
  if (!/^\d+$/.test(pan)) return false;
  if (/^0+$/.test(pan)) return false;
  let sum = 0;
  let alternate = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let n = pan.charCodeAt(i) - 48;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
};
