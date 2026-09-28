/** Backend mutations (backend/, pytest). Needs a Python with requirements.txt installed: set BACKEND_PYTHON. */
module.exports = {
  cwd: "backend",
  runner: "pytest",
  mutations: [
    { id: "postgres-url-default-driver", file: "backend/app/config.py", from: "                return \"postgresql+psycopg2://\" + url[len(prefix) :]", to: "                return \"postgresql://\" + url[len(prefix) :]", kills: ["test_postgres_urls_use_the_installed_psycopg2_driver[postgres:", "test_postgres_urls_use_the_installed_psycopg2_driver[postgresql:"] },
  ],
};
