#!/bin/bash
# Runs once, on the first start of an empty data volume (MySQL entrypoint convention).
# The entrypoint has already created MYSQL_DATABASE (task_approval) and MYSQL_USER.
set -euo pipefail

mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS task_approval_test
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

GRANT ALL PRIVILEGES ON task_approval.* TO '${MYSQL_USER}'@'%';
GRANT ALL PRIVILEGES ON task_approval_test.* TO '${MYSQL_USER}'@'%';

-- LOCAL DEVELOPMENT ONLY: \`prisma migrate dev\` creates and drops a temporary
-- shadow database with a generated name, which needs these global privileges.
GRANT CREATE, ALTER, DROP, REFERENCES, INDEX ON *.* TO '${MYSQL_USER}'@'%';

FLUSH PRIVILEGES;
SQL
