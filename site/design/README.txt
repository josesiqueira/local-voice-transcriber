Image sources for the site and the extension icons. Run build-images.sh from this folder
after changing an SVG. It needs Inkscape and ImageMagick.

  logo.svg (in ../src/assets/)     header logo, drawn on a 32 unit grid
  logo-16.svg (in ../src/assets/)  pixel-aligned variant for 16 and 32 px: favicon.svg,
                                   extension icon16.png and icon32.png
  touch-icon.svg                   square icon for phone home screens: apple-touch-icon.png
  og-source.svg                    social preview card (1200x630); it contains the product
                                   name as text, set in "IBM Plex Sans OG", a static instance
                                   of the site's IBM Plex Sans font. build-images.sh converts
                                   the text to outlines (og.svg) so the PNG does not depend
                                   on installed fonts.
