// SVG 安全校验（元素/属性/CSS 白名单）与解析。
// 由原 preview_image.rs 按域拆分而来，纯搬运，未改行为。

pub(crate) const SVG_NAMESPACE: &str = "http://www.w3.org/2000/svg";
pub(crate) const XLINK_NAMESPACE: &str = "http://www.w3.org/1999/xlink";
pub(crate) const XML_NAMESPACE: &str = "http://www.w3.org/XML/1998/namespace";
pub(crate) fn is_safe_svg_element(name: &str) -> bool {
    matches!(
        name,
        "svg"
            | "g"
            | "defs"
            | "symbol"
            | "use"
            | "switch"
            | "path"
            | "rect"
            | "circle"
            | "ellipse"
            | "line"
            | "polyline"
            | "polygon"
            | "text"
            | "tspan"
            | "textPath"
            | "title"
            | "desc"
            | "metadata"
            | "marker"
            | "pattern"
            | "linearGradient"
            | "radialGradient"
            | "stop"
            | "clipPath"
            | "mask"
            | "filter"
            | "feBlend"
            | "feColorMatrix"
            | "feComponentTransfer"
            | "feComposite"
            | "feConvolveMatrix"
            | "feDiffuseLighting"
            | "feDisplacementMap"
            | "feDistantLight"
            | "feDropShadow"
            | "feFlood"
            | "feFuncA"
            | "feFuncB"
            | "feFuncG"
            | "feFuncR"
            | "feGaussianBlur"
            | "feMerge"
            | "feMergeNode"
            | "feMorphology"
            | "feOffset"
            | "fePointLight"
            | "feSpecularLighting"
            | "feSpotLight"
            | "feTile"
            | "feTurbulence"
    )
}
pub(crate) fn validate_svg_url_tokens(value: &str) -> Result<(), String> {
    if value.contains('\\') || value.contains("/*") || value.contains("*/") {
        return Err("SVG CSS escapes and comments are not allowed".into());
    }

    let lower = value.to_ascii_lowercase();
    if lower.contains("@import") || lower.contains("expression(") || lower.contains("-moz-binding")
    {
        return Err("SVG active or external styles are not allowed".into());
    }

    let mut remainder = value;
    loop {
        let lower_remainder = remainder.to_ascii_lowercase();
        let Some(start) = lower_remainder.find("url(") else {
            return Ok(());
        };
        let after_open = &remainder[start + 4..];
        let Some(end) = after_open.find(')') else {
            return Err("invalid SVG URL reference".into());
        };
        let target = after_open[..end]
            .trim()
            .trim_matches(|character| matches!(character, '\'' | '"'))
            .trim();
        if !target.starts_with('#') || target.len() == 1 {
            return Err("SVG external URL references are not allowed".into());
        }
        remainder = &after_open[end + 1..];
    }
}
pub(crate) fn validate_svg_safety(bytes: &[u8]) -> Result<(), String> {
    let xml = std::str::from_utf8(bytes).map_err(|_| "invalid SVG XML encoding".to_string())?;
    let document =
        roxmltree::Document::parse(xml).map_err(|error| format!("invalid SVG XML: {error}"))?;
    if document.descendants().any(|node| node.is_pi()) {
        return Err("SVG processing instructions are not allowed".into());
    }

    for node in document.descendants().filter(roxmltree::Node::is_element) {
        let tag = node.tag_name();
        if tag.namespace() != Some(SVG_NAMESPACE) || !is_safe_svg_element(tag.name()) {
            return Err("SVG contains an unsafe element".into());
        }

        for attribute in node.attributes() {
            let name = attribute.name();
            match attribute.namespace() {
                None => {}
                Some(XLINK_NAMESPACE) if name == "href" => {}
                Some(XML_NAMESPACE) if matches!(name, "lang" | "space") => {}
                _ => return Err("SVG contains an unsafe namespaced attribute".into()),
            }

            if name.len() > 2
                && name
                    .get(..2)
                    .is_some_and(|prefix| prefix.eq_ignore_ascii_case("on"))
            {
                return Err("SVG event handlers are not allowed".into());
            }
            if matches!(
                name.to_ascii_lowercase().as_str(),
                "style" | "src" | "srcdoc"
            ) {
                return Err("SVG active or external resource attributes are not allowed".into());
            }
            if name.eq_ignore_ascii_case("href") {
                let target = attribute.value().trim();
                if !target.starts_with('#') || target.len() == 1 {
                    return Err("SVG external references are not allowed".into());
                }
            }
            validate_svg_url_tokens(attribute.value())?;
        }
    }
    Ok(())
}
pub(crate) fn parse_svg(bytes: &[u8]) -> Result<resvg::usvg::Tree, String> {
    if bytes.starts_with(&[0x1f, 0x8b]) {
        return Err("compressed SVG/SVGZ is not supported".into());
    }
    validate_svg_safety(bytes)?;
    let mut options = resvg::usvg::Options::default();
    options.resources_dir = None;
    options.image_href_resolver = resvg::usvg::ImageHrefResolver {
        resolve_data: Box::new(|_, _, _| None),
        resolve_string: Box::new(|_, _| None),
    };
    resvg::usvg::Tree::from_data(bytes, &options).map_err(|e| format!("invalid SVG: {e}"))
}
