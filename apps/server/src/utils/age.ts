export function isAdult(dobIso: string) {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) {
    return false;
  }
  const now = new Date();
  const adultDate = new Date(
    dob.getUTCFullYear() + 18,
    dob.getUTCMonth(),
    dob.getUTCDate()
  );
  return now >= adultDate;
}
