import ast
import io
import unittest
from pathlib import Path
from unittest.mock import MagicMock
from PIL import Image
from ceo_signature_service import normalize_signature, MAX_SIGNATURE_BYTES
from certificate_renderer import _draw_signature
from reportlab.lib.utils import ImageReader


def sample_image(fmt='PNG', size=(160, 60)):
    buffer=io.BytesIO()
    Image.new('RGBA' if fmt=='PNG' else 'RGB', size, (0,0,0,0) if fmt=='PNG' else 'white').save(buffer,format=fmt)
    return buffer.getvalue()


class CEOSignatureTests(unittest.TestCase):
    def test_png_preserves_transparency(self):
        result=normalize_signature(sample_image(),'image/png')
        image=Image.open(io.BytesIO(result))
        self.assertEqual(image.format,'PNG')
        self.assertEqual(image.getpixel((0,0))[3],0)

    def test_jpeg_converted_to_png(self):
        image=Image.open(io.BytesIO(normalize_signature(sample_image('JPEG'),'image/jpeg')))
        self.assertEqual(image.format,'PNG')

    def test_invalid_empty_oversized_and_mismatched_files_rejected(self):
        for data,mime in [(b'','image/png'),(b'not an image','image/png'),
                (b'x'*(MAX_SIGNATURE_BYTES+1),'image/png'),(sample_image(),'image/jpeg'),(sample_image(),'image/svg+xml')]:
            with self.subTest(mime=mime,size=len(data)),self.assertRaises(ValueError):normalize_signature(data,mime)

    def test_large_dimensions_rejected(self):
        with self.assertRaises(ValueError):normalize_signature(sample_image(size=(4001,1)),'image/png')

    def test_renderer_draws_private_database_image(self):
        canvas=MagicMock()
        image=ImageReader(io.BytesIO(sample_image()))
        _draw_signature(canvas,100,100,'CEO',['Tarannum Technologies'],image)
        self.assertIs(canvas.drawImage.call_args.args[0],image)
        self.assertEqual(canvas.drawImage.call_args.kwargs['mask'],'auto')

    def test_upload_status_and_preview_are_admin_only(self):
        tree=ast.parse(Path(__file__).with_name('certification_endpoints.py').read_text(encoding='utf-8'))
        for name in ['ceo_signature_status','ceo_signature_preview','upload_ceo_signature']:
            fn=next(n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name==name)
            self.assertIn('Depends(get_current_admin_user)',ast.unparse(fn))


if __name__=='__main__':unittest.main()
