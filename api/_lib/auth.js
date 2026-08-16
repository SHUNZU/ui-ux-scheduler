function hasEditAccess(req) {
  const accepted = [
    process.env.ADMIN_PASSWORD || "admin",
    process.env.EDIT_KEY,
    process.env.SYNC_SECRET
  ].filter(Boolean);

  return accepted.some((secret) => req.headers.authorization === `Bearer ${secret}`);
}

module.exports = { hasEditAccess };
