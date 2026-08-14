"""Approve must fire the payload. Invite-all must ask at default autonomy."""
import asyncio
import unittest
from unittest.mock import MagicMock, patch

from api.doctrine.orchestrator import requires_approval
from api.runtime import tool_executor as te


class InviteThresholdTest(unittest.TestCase):

    def test_default_autonomy_must_ask(self):
        self.assertTrue(requires_approval("invite_all_users", 2))

    def test_autonomy_3_may_invite(self):
        self.assertFalse(requires_approval("invite_all_users", 3))

    def test_publish_still_fires_at_default(self):
        self.assertFalse(requires_approval("publish_entity", 2))
        self.assertFalse(requires_approval("send_message", 2))
        self.assertFalse(requires_approval("create_relationship", 2))


class ExecuteApprovedTest(unittest.TestCase):

    def test_unknown_type_errors(self):
        with patch.object(te, "get_sb"):
            out = asyncio.run(te.execute_approved("not_a_thing", {}))
        self.assertIn("error", out)

    def test_invite_all_uses_do_invite(self):
        fake = MagicMock()
        with patch.object(te, "get_sb", return_value=fake):
            with patch.object(te, "_do_invite_all", return_value={"status": "done", "invited": 2}) as do:
                out = asyncio.run(
                    te.execute_approved(
                        "invite_all_users",
                        {"workspace_id": "ws-1", "owner_id": "u-1"},
                    )
                )
        do.assert_called_once_with(fake, "ws-1", "u-1")
        self.assertEqual(out["status"], "done")

    def test_publish_inserts_entity(self):
        sb = MagicMock()
        sb.table.return_value.insert.return_value.execute.return_value.data = [{"id": "e-1"}]
        with patch.object(te, "get_sb", return_value=sb):
            out = asyncio.run(
                te.execute_approved("publish_entity", {"entity": {"name": "x"}})
            )
        self.assertEqual(out["status"], "published")
        self.assertEqual(out["entity_id"], "e-1")

    def test_publish_empty_insert_errors(self):
        sb = MagicMock()
        sb.table.return_value.insert.return_value.execute.return_value.data = []
        with patch.object(te, "get_sb", return_value=sb):
            out = asyncio.run(
                te.execute_approved("publish_entity", {"entity": {"name": "x"}})
            )
        self.assertIn("error", out)


if __name__ == "__main__":
    unittest.main()
