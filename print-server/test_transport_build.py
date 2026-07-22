import unittest
from transport import build_transport, CupsTransport

class TestBuildTransport(unittest.TestCase):
    def test_cups_kind_returns_cups(self):
        t = build_transport("cups", {"cups_printer": "GEZHI_POS_Printer"})
        self.assertIsInstance(t, CupsTransport)
        self.assertEqual(t.printer_name, "GEZHI_POS_Printer")

    def test_usb_open_failure_falls_back_to_cups(self):
        # VID/PID 0:0 never resolves → UsbTransport.open() raises → fallback
        t = build_transport("usb", {"vid": 0, "pid": 0, "ep_out": 2, "ep_in": 0x81,
                                    "cups_printer": "Xprinter_XP_365B"})
        self.assertIsInstance(t, CupsTransport)
        self.assertEqual(t.printer_name, "Xprinter_XP_365B")

if __name__ == "__main__":
    unittest.main()
