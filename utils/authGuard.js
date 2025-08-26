export function checkAuthAndRedirect(router, currentRoute = '/') {
  const token = localStorage.getItem('token');
  if (!token) {
    // Redirect to login with return path
    router.push({
      path: '/login',
      query: { redirect: currentRoute }
    });
    return false;
  }
  return true;
}

export function isTokenValid(token) {
  if (!token) return false;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch (e) {
    return false;
  }
}