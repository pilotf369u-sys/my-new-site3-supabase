(function () {
  'use strict';

  function safeParse(value) {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function dashboardForRole(role) {
    const routes = {
      admin: 'admin-dashboard.html',
      employee: 'employee-dashboard.html',
      delivery: 'delivery-dashboard.html',
      branch: 'branch-dashboard.html',
      customer: 'dashboard.html',
    };

    return routes[role] || routes.customer;
  }

  function installHomepageAuthButton() {
    const path = window.location.pathname;
    if (!path.endsWith('/index.html') && !path.endsWith('index.html') && !path.endsWith('/')) {
      return;
    }

    const authLink = document.getElementById('authLink');
    const authText = document.getElementById('authText');
    const logoutBtn = document.getElementById('logoutBtn');

    if (!authLink) return;

    // A functional default that never depends on async JavaScript.
    authLink.href = 'login.html';

    const user = safeParse(localStorage.getItem('loggedInUser'));

    if (user && (user.id || user.phone || user.email)) {
      authLink.href = dashboardForRole(user.role || 'customer');
      if (authText) {
        authText.textContent = user.name || user.username || 'حسابي';
      }
      if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
      }
    } else {
      if (authText) authText.textContent = 'حسابي / تسجيل';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }

    // Capture phase prevents an old inline handler or href="#" from blocking navigation.
    authLink.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopImmediatePropagation();

        const currentUser = safeParse(localStorage.getItem('loggedInUser'));
        const destination = currentUser && (currentUser.id || currentUser.phone || currentUser.email)
          ? dashboardForRole(currentUser.role || 'customer')
          : 'login.html';

        window.location.assign(destination);
      },
      true,
    );

    console.info('[Homepage Auth] Login/account button is ready:', authLink.href);
  }

  if (window.cloudDbReady && typeof window.cloudDbReady.then === 'function') {
    window.cloudDbReady.finally(installHomepageAuthButton);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installHomepageAuthButton, { once: true });
  } else {
    installHomepageAuthButton();
  }
})();
