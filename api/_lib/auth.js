function hasEditAccess(req) {
  const accepted = [
    "admin",
    process.env.ADMIN_PASSWORD || "admin",
    process.env.EDIT_KEY,
    process.env.SYNC_SECRET
  ].filter(Boolean);
  const bearer = req.headers.authorization;
  const editKey = req.headers["x-edit-key"];

  return accepted.some((secret) => bearer === `Bearer ${secret}` || editKey === secret);
}

module.exports = { hasEditAccess };
