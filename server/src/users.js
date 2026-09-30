// Two hardcoded users. To change passwords, edit and re-deploy.
export const USERS = [
  { id: 'miguel', name: 'Miguel', phone: '867272348', password: 'Neyma' },
  { id: 'neyma', name: 'Neyma', phone: '840532528', password: 'Miguel' },
];

export function findUser(phone, password) {
  return USERS.find(
    (u) => u.phone === String(phone).trim() && u.password === String(password),
  );
}

export function partnerOf(userId) {
  return USERS.find((u) => u.id !== userId);
}

export function userById(id) {
  return USERS.find((u) => u.id === id);
}
