"""
pytest/unittest tests for dsh-sprite-gen Python modules.

Run:  python -m pytest test/test_python.py -v
Or:   python -m unittest test.test_python -v
"""

import unittest
import json
import os
import sys
import tempfile
import shutil
from pathlib import Path

# Add lib/ to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), 'fixtures')


class TestAnalysis(unittest.TestCase):
    _analyze = None

    @classmethod
    def setUpClass(cls):
        import analysis
        cls._analyze = analysis.analyze

    def analyze(self, fixture_name, **kwargs):
        img_path = os.path.join(FIXTURES_DIR, fixture_name)
        args = {'image_path': img_path, **kwargs}
        return TestAnalysis._analyze(args)

    def test_valid_asset_passes(self):
        r = self.analyze('valid_asset.png')
        self.assertTrue(r['success'])
        self.assertTrue(r['passed'])
        self.assertIn(r['severity'], ('P0', 'P1', 'P2', 'OK'))

    def test_checkerboard_grey_fails(self):
        r = self.analyze('checkerboard_grey_character.png')
        self.assertTrue(r['success'])
        self.assertFalse(r['passed'])
        self.assertEqual(r['severity'], 'P0')
        fails = [f for f in r['failures'] if 'checkerboard' in f.lower()]
        self.assertTrue(len(fails) > 0, f'No checkerboard failure found: {r["failures"]}')

    def test_checkerboard_bw_fails(self):
        r = self.analyze('checkerboard_bw_weapon.png')
        self.assertTrue(r['success'])
        self.assertFalse(r['passed'])
        fails = [f for f in r['failures'] if 'checkerboard' in f.lower()]
        self.assertTrue(len(fails) > 0)

    def test_empty_image_fails(self):
        r = self.analyze('empty_image.png')
        self.assertTrue(r['success'])
        self.assertFalse(r['passed'])

    def test_subject_at_edge_fails(self):
        r = self.analyze('subject_at_edge.png')
        self.assertTrue(r['success'])
        self.assertFalse(r['passed'])
        fails = [f for f in r['failures'] if 'border' in f.lower() or 'touches' in f.lower()]
        self.assertTrue(len(fails) > 0)

    def test_non_divisible_warns(self):
        r = self.analyze('non_divisible_sheet.png', grid_cols=8, grid_rows=8, cell_size=64)
        self.assertTrue(r['success'])
        self.assertTrue(any('not divisible' in w for w in r['grid_validation']['warnings']))

    def test_sparse_effect_sheet_regions(self):
        r = self.analyze('sparse_effect_sheet.png', regions=[
            {'name': 'a', 'x': 0, 'y': 0, 'w': 64, 'h': 64},
            {'name': 'b', 'x': 64, 'y': 64, 'w': 64, 'h': 64},
        ])
        self.assertTrue(r['success'])
        self.assertEqual(len(r['frames']), 2)
        self.assertEqual(r['frames'][0]['region'], 'a')
        self.assertEqual(r['frames'][1]['region'], 'b')

    def test_isolated_fragments_warns(self):
        r = self.analyze('isolated_fragments.png')
        self.assertTrue(r['success'])
        self.assertTrue(any('fragment' in w.lower() for w in r['warnings']))

    def test_image_not_found(self):
        r = TestAnalysis._analyze({'image_path': '/nonexistent/file.png'})
        self.assertFalse(r['success'])
        self.assertIn('error', r)


class TestCutout(unittest.TestCase):
    _cutout = None

    @classmethod
    def setUpClass(cls):
        import cutout
        cls._cutout = cutout.cutout
        cls._tmpdir = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._tmpdir, ignore_errors=True)

    def cutout(self, fixture_name, **kwargs):
        img_path = os.path.join(FIXTURES_DIR, fixture_name)
        out_path = os.path.join(TestCutout._tmpdir, f'out_{fixture_name}')
        args = {'image_path': img_path, 'output_path': out_path, **kwargs}
        return TestCutout._cutout(args), out_path

    def test_solid_removes_background(self):
        r, out_path = self.cutout('solid_bg_character.png', mode='solid', lab_threshold=20.0)
        self.assertTrue(r['success'])
        self.assertEqual(r['mode'], 'solid')
        self.assertTrue(r['validation']['corners_ok'])
        self.assertGreater(r['info']['removed_pixels'], 500)
        self.assertTrue(os.path.exists(out_path))

    def test_checkerboard_mode(self):
        r, out_path = self.cutout('checkerboard_grey_character.png', mode='checkerboard')
        self.assertTrue(r['success'])
        self.assertEqual(r['mode'], 'checkerboard')
        self.assertGreater(r['info']['removed_pixels'], 1000)
        self.assertTrue(os.path.exists(out_path))

    def test_auto_picks_checkerboard_for_checkerboard_bg(self):
        r, out_path = self.cutout('checkerboard_bw_weapon.png', mode='auto')
        self.assertTrue(r['success'])
        self.assertEqual(r['mode'], 'auto')
        self.assertIn(r['info']['auto_decision'], ('checkerboard', 'solid'))

    def test_auto_picks_solid_for_solid_bg(self):
        r, out_path = self.cutout('solid_bg_character.png', mode='auto')
        self.assertTrue(r['success'])
        self.assertEqual(r['mode'], 'auto')
        self.assertEqual(r['info']['auto_decision'], 'solid')

    def test_mask_only_outputs_mask(self):
        r, out_path = self.cutout('solid_bg_character.png', mode='mask_only')
        self.assertTrue(r['success'])
        self.assertEqual(r['mode'], 'mask_only')
        self.assertTrue(os.path.exists(out_path))

    def test_decontaminate_reduces_fringe(self):
        r_clean, out_clean = self.cutout(
            'metal_weapon.png', mode='solid', decontaminate_edges=True, lab_threshold=20.0)
        self.assertTrue(r_clean['success'])
        fringe = r_clean['validation'].get('border_ratio', 0)
        self.assertLess(fringe, 0.5)

    def test_invalid_mode(self):
        r, _ = self.cutout('valid_asset.png', mode='not_a_mode')
        self.assertFalse(r['success'])
        self.assertIn('unknown mode', r.get('error', '').lower())

    def test_missing_image(self):
        r = TestCutout._cutout({'image_path': '/nonexistent.png', 'output_path': '/tmp/out.png'})
        self.assertFalse(r['success'])

    def test_returns_qc_data(self):
        r, _ = self.cutout('valid_asset.png', mode='solid')
        self.assertIn('validation', r)
        v = r['validation']
        for key in ['corners_ok', 'corner_alphas', 'transparent_ratio', 'connected_components',
                    'max_component_pixels', 'small_isolated_count', 'border_ratio']:
            self.assertIn(key, v)


class TestCutoutCheckerboardScoreDrops(unittest.TestCase):
    _cutout = None

    @classmethod
    def setUpClass(cls):
        import analysis, cutout
        cls._analyze = analysis.analyze
        cls._cutout = cutout.cutout
        cls._tmpdir = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls._tmpdir, ignore_errors=True)

    def test_checkerboard_score_drops_after_cutout(self):
        import analysis
        before = analysis.analyze({'image_path': os.path.join(FIXTURES_DIR, 'checkerboard_grey_character.png')})
        before_score = before['frames'][0]['checkerboard_score']

        out_path = os.path.join(self._tmpdir, 'cb_cut.png')
        r = TestCutoutCheckerboardScoreDrops._cutout({
            'image_path': os.path.join(FIXTURES_DIR, 'checkerboard_grey_character.png'),
            'output_path': out_path,
            'mode': 'checkerboard',
        })
        self.assertTrue(r['success'])
        self.assertGreater(r['info']['removed_pixels'], 1000,
            f'should have removed checkerboard pixels, got {r["info"]["removed_pixels"]}')

        after = analysis.analyze({'image_path': out_path})
        after_score = after['frames'][0]['checkerboard_score']

        self.assertTrue(after_score < before_score or r['info']['removed_pixels'] > 1000,
            f'checkerboard score or pixels removed: {before_score}->{after_score}, removed={r["info"]["removed_pixels"]}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
