#!/usr/bin/env python3
"""Update a boardsite user's password, display name, or role.

cd api && uv run python3 scripts/update-user.py --username admin --password newsecret [--env dev]
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bcrypt


def main():
    parser = argparse.ArgumentParser(description="Update a boardsite user")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password")
    parser.add_argument("--display-name")
    parser.add_argument("--role", choices=["admin", "normal"])
    parser.add_argument("--email", help="Optional — set/update the address for password reset")
    parser.add_argument("--env", choices=["prod", "dev"], default="prod")
    args = parser.parse_args()

    if not any([args.password, args.display_name, args.role, args.email]):
        print("Nothing to update — pass --password, --display-name, --role, and/or --email.")
        sys.exit(1)

    if args.env == "dev":
        os.environ.setdefault("USERS_TABLE", "boardsite-users-dev")

    from lib.db.users import get_user, put_user  # deferred: --env must set USERS_TABLE first

    user = get_user(args.username)
    if not user:
        print(f"User '{args.username}' not found.")
        sys.exit(1)

    updated = ", ".join(
        name
        for name, present in (
            ("passwordHash", args.password),
            ("displayName", args.display_name),
            ("role", args.role),
            ("email", args.email),
        )
        if present
    )

    if args.password:
        user["passwordHash"] = bcrypt.hashpw(args.password.encode(), bcrypt.gensalt()).decode()
    # A role change revokes sessions too: the role rides in the JWT, and a
    # demoted admin must not keep a 7-day token that still says "admin".
    revoke = bool(args.password or args.role)
    if revoke:
        user["tokenVersion"] = user.get("tokenVersion", 0) + 1
    if args.display_name:
        user["displayName"] = args.display_name
    if args.role:
        user["role"] = args.role
    if args.email:
        user["email"] = args.email

    put_user(user)
    suffix = " — sessions revoked" if revoke else ""
    print(f"Updated: {args.username} ({updated}){suffix}")


if __name__ == "__main__":
    main()
