-- db.sql for 'socialposter' : schema + seed data. Import into an existing empty database:  mariadb socialposter < db.sql
SET FOREIGN_KEY_CHECKS=0; SET NAMES utf8mb4;

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `business_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `description` text NOT NULL,
  `autoPublish` tinyint(4) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `products` text DEFAULT NULL,
  `slug` varchar(100) NOT NULL,
  `metaPromptTemplate` text DEFAULT NULL,
  `linkedinPromptTemplate` text DEFAULT NULL,
  `autoScheduleEnabled` tinyint(4) NOT NULL DEFAULT 0,
  `scheduleCron` varchar(100) DEFAULT NULL,
  `scheduleTimezone` varchar(100) NOT NULL DEFAULT 'Asia/Dubai',
  `schedulePlatforms` varchar(100) NOT NULL DEFAULT 'facebook,instagram',
  `lastPostedAt` datetime DEFAULT NULL,
  `productPostPromptTemplate` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_5f66561947eba2379b1cff4437` (`slug`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `linkedin_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `linkedin_accounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `accessToken` text NOT NULL,
  `expiresAt` datetime NOT NULL,
  `personUrn` varchar(255) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `businessId` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_72e1a30c26331c4017daec1ccb` (`businessId`),
  CONSTRAINT `FK_72e1a30c26331c4017daec1ccb9` FOREIGN KEY (`businessId`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `logos`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `logos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `businessId` int(11) NOT NULL,
  `prompt` text NOT NULL,
  `imageUrl` varchar(500) NOT NULL,
  `parentLogoId` int(11) DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  PRIMARY KEY (`id`),
  KEY `FK_60f7bfba723afc24864a45111d2` (`businessId`),
  CONSTRAINT `FK_60f7bfba723afc24864a45111d2` FOREIGN KEY (`businessId`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `post_publications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_publications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `postId` int(11) NOT NULL,
  `platform` enum('linkedin','facebook','instagram') NOT NULL,
  `status` enum('draft','published','failed') NOT NULL DEFAULT 'draft',
  `externalPostId` varchar(255) DEFAULT NULL,
  `errorMessage` text DEFAULT NULL,
  `publishedAt` datetime DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_60cc489a4b0702262ea037676c` (`postId`,`platform`),
  CONSTRAINT `FK_688288003f3a0f1488f75039465` FOREIGN KEY (`postId`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=395 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `posts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `imagePrompt` text NOT NULL,
  `imageUrl` varchar(500) NOT NULL,
  `caption` text NOT NULL,
  `hashtags` text DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `businessId` int(11) DEFAULT NULL,
  `platform` enum('linkedin','facebook','instagram') NOT NULL DEFAULT 'linkedin',
  `sourceImageUrl` varchar(500) DEFAULT NULL,
  `brief` text DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_c99c5e385765116e09d0d5d8343` (`businessId`),
  CONSTRAINT `FK_c99c5e385765116e09d0d5d8343` FOREIGN KEY (`businessId`) REFERENCES `business_profiles` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB AUTO_INCREMENT=260 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

SET FOREIGN_KEY_CHECKS=1;
