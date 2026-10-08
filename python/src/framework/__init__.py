"""Reference test automation framework for the Toolshop demo target.

Five layers, dependency direction strictly downward:

    tests -> flows -> pages/clients -> support/models

Nothing under ``framework`` imports anything under ``tests``. ``pages``,
``clients`` and ``flows`` contain no assertions: assertions live only in tests.
"""
