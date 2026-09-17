-- Rename the Resida application database account while preserving its grants.
RENAME USER 'resua_app'@'%' TO 'resida_app'@'%';
