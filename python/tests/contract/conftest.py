"""Fixtures scoped to the contract suite.

There are none. The clients and the account flow this suite needs live in the
root ``conftest.py``, because the API suite uses them too, and the
``no_internal_detail_leaked`` fixture belongs to the API suite alone.

This file exists only to say so. An almost-empty conftest with a docstring is
better than a fixture in the wrong place, and markers are written on the tests
explicitly rather than applied by an autouse hook, so a reader can see which
suite a test belongs to.
"""
